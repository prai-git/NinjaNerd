import os
import json
import requests
import queue
import threading
import time
import uuid
import re
import logging
from datetime import datetime
from openai import OpenAI


class LLMService:
    """
    Service class for handling all LLM-related functionality including API calls,
    answer checking, queue management, and session tracking.
    """
    
    def __init__(self, logger, model_type='deepseek'):
        """
        Initialize the LLM service with queue management and worker threads.
        
        Args:
            logger: Logger instance for consistent logging across the application
            model_type: Type of LLM model to use ('deepseek' or 'openai')
        """
        self.logger = logger
        self.model_type = model_type.lower()
        
        # Environment variables for DeepSeek
        self.LLM_ENDPOINT = os.getenv('PR_LLM_ENDPOINT', '')
        self.LLM_API_KEY = os.getenv('PR_LLM_API_KEY', '')
        
        # Environment variables for OpenAI
        self.OPENAI_API_KEY = os.getenv('PR_OPENAI_API_KEY', '')
        self.OPENAI_ENDPOINT = os.getenv('PR_OPENAI_API_ENDPOINT', '')  # Optional custom endpoint
        
        # Initialize OpenAI client if using OpenAI
        self.openai_client = None
        if self.model_type == 'openai' and self.OPENAI_API_KEY:
            try:
                # Check if custom endpoint is provided
                if self.OPENAI_ENDPOINT:
                    # Extract base URL from full endpoint if it contains the full path
                    if '/chat/completions' in self.OPENAI_ENDPOINT:
                        base_url = self.OPENAI_ENDPOINT.replace('/chat/completions', '')
                    else:
                        base_url = self.OPENAI_ENDPOINT
                    self.openai_client = OpenAI(api_key=self.OPENAI_API_KEY, base_url=base_url)
                else:
                    # Use default OpenAI endpoint
                    self.openai_client = OpenAI(api_key=self.OPENAI_API_KEY)
                self.logger.info("OpenAI client initialized successfully")
            except Exception as e:
                self.logger.error(f"Failed to initialize OpenAI client: {str(e)}")
                self.openai_client = None
        
        # LLM Queue Configuration
        self.LLM_REQUEST_QUEUE = queue.Queue()
        self.LLM_RESPONSE_MAP = {}  # Map of request_id to response
        self.LLM_SESSION_REQUESTS = {}  # Map of session_id to list of request_ids
        self.LLM_REQUEST_TIMEOUT = 300  # seconds
        self.MAX_WORKER_THREADS = 20  # Maximum number of worker threads
        self.MAX_RETRIES = 3  # Maximum number of retries for failed requests
        self.WORKER_THREADS = []  # List to keep track of worker threads
        self.SESSION_PRIORITY_THRESHOLD = 5  # Maximum number of pending requests per session
        
        # Reference to active sessions (set by main app)
        self.active_sessions = {}
        
        # Start worker threads and cleanup thread
        self._start_worker_threads()
        self._start_cleanup_thread()
    
    def set_active_sessions_reference(self, active_sessions):
        """
        Set reference to the main application's active_sessions dictionary.
        
        Args:
            active_sessions: Reference to the active sessions dictionary from main app
        """
        self.active_sessions = active_sessions
    
    def call_llm_api(self, prompt, user_history=[], session_id=None, username=None):
        """
        Call LLM API (DeepSeek or OpenAI) using queue system for concurrent users.
        
        Args:
            prompt: The prompt to send to the LLM
            user_history: List of previous user interactions for context
            session_id: Current session ID for tracking
            username: Username for logging and session management
            
        Returns:
            dict: LLM response or mock questions if API unavailable
        """
        # Check if API is available based on model type
        api_available = False
        if self.model_type == 'deepseek':
            api_available = bool(self.LLM_ENDPOINT and self.LLM_API_KEY)
        elif self.model_type == 'openai':
            api_available = bool(self.openai_client and self.OPENAI_API_KEY)
        
        if not api_available:
            # Mock response for development
            return self._generate_mock_questions(prompt)
        
        # Generate a unique request ID
        request_id = str(uuid.uuid4())
        
        try:
            # Put request in queue with session context
            self.LLM_REQUEST_QUEUE.put((request_id, prompt, user_history, session_id, username))
            
            # Register this request with the session if session exists
            if session_id:
                if session_id not in self.LLM_SESSION_REQUESTS:
                    self.LLM_SESSION_REQUESTS[session_id] = []
                self.LLM_SESSION_REQUESTS[session_id].append(request_id)
            
            # Wait for response with timeout
            start_time = time.time()
            while time.time() - start_time < self.LLM_REQUEST_TIMEOUT:
                if request_id in self.LLM_RESPONSE_MAP:
                    response = self.LLM_RESPONSE_MAP[request_id]
                    # Clean up
                    del self.LLM_RESPONSE_MAP[request_id]
                    # Remove from session tracking if session exists
                    if session_id and session_id in self.LLM_SESSION_REQUESTS:
                        if request_id in self.LLM_SESSION_REQUESTS[session_id]:
                            self.LLM_SESSION_REQUESTS[session_id].remove(request_id)
                    return response
                time.sleep(0.1)  # Short sleep to prevent CPU hogging
            
            # Timeout occurred
            self.logger.warning(f"LLM API request timed out after {self.LLM_REQUEST_TIMEOUT}s")
            # Clean up session tracking if session exists
            if session_id and session_id in self.LLM_SESSION_REQUESTS:
                if request_id in self.LLM_SESSION_REQUESTS[session_id]:
                    self.LLM_SESSION_REQUESTS[session_id].remove(request_id)
            return self._generate_mock_questions(prompt)
            
        except Exception as e:
            self.logger.error(f"LLM API queue error: {str(e)}")
            return self._generate_mock_questions(prompt)
    
    def check_answer_with_llm(self, question, user_answer, correct_explanation, session_id=None, username=None):
        """
        Use LLM to check if user's answer is correct.
        
        Args:
            question: The original question text
            user_answer: User's submitted answer
            correct_explanation: The correct answer and explanation
            session_id: Current session ID for tracking
            username: Username for logging and session management
            
        Returns:
            bool: True if answer is correct, False otherwise
        """
        # Check if API is available based on model type
        api_available = False
        if self.model_type == 'deepseek':
            api_available = bool(self.LLM_ENDPOINT and self.LLM_API_KEY)
        elif self.model_type == 'openai':
            api_available = bool(self.openai_client and self.OPENAI_API_KEY)
        
        if not api_available:
            # For mock questions, do basic comparison
            # For math problems, try to extract numbers and check
            if any(word in question.lower() for word in ['stickers', 'apples', 'toys', 'books']):
                # Try to find the expected answer in the explanation
                numbers = re.findall(r'\d+', correct_explanation)
                if numbers:
                    expected = numbers[-1]  # Usually the last number is the answer
                    return str(user_answer).strip() == expected
            return False
        
        # Generate a unique request ID
        request_id = str(uuid.uuid4())
        
        try:
            check_prompt = f"""
            Question: {question}
            Student's Answer: {user_answer}
            Correct Answer and Explanation: {correct_explanation}
            
            Is the student's answer correct? Respond with only "CORRECT" or "INCORRECT" followed by a brief explanation.
            Consider partial credit for math problems where the method is right but there might be a small calculation error.
            """
            
            # Use the queue for answer checking with session context
            self.LLM_REQUEST_QUEUE.put((request_id, check_prompt, [], session_id, username))
            
            # Register this request with the session if session exists
            if session_id:
                if session_id not in self.LLM_SESSION_REQUESTS:
                    self.LLM_SESSION_REQUESTS[session_id] = []
                self.LLM_SESSION_REQUESTS[session_id].append(request_id)
            
            # Wait for response with timeout
            start_time = time.time()
            while time.time() - start_time < self.LLM_REQUEST_TIMEOUT:
                if request_id in self.LLM_RESPONSE_MAP:
                    response_data = self.LLM_RESPONSE_MAP[request_id]
                    # Clean up
                    del self.LLM_RESPONSE_MAP[request_id]
                    
                    # Remove from session tracking if session exists
                    if session_id and session_id in self.LLM_SESSION_REQUESTS:
                        if request_id in self.LLM_SESSION_REQUESTS[session_id]:
                            self.LLM_SESSION_REQUESTS[session_id].remove(request_id)
                    
                    if isinstance(response_data, dict) and 'choices' in response_data:
                        content = response_data['choices'][0]['message']['content'].strip()
                        # Check if the response indicates correct answer
                        is_correct = content.upper().startswith('CORRECT')
                        return is_correct
                    else:
                        # If we got an unexpected response format, fall back to basic checking
                        return str(user_answer).strip().lower() in correct_explanation.lower()
                
                time.sleep(0.1)  # Short sleep to prevent CPU hogging
            
            # Timeout occurred, fall back to basic checking
            self.logger.warning(f"Answer checking timed out after {self.LLM_REQUEST_TIMEOUT}s")
            
            # Clean up session tracking if session exists
            if session_id and session_id in self.LLM_SESSION_REQUESTS:
                if request_id in self.LLM_SESSION_REQUESTS[session_id]:
                    self.LLM_SESSION_REQUESTS[session_id].remove(request_id)
                    
            return str(user_answer).strip().lower() in correct_explanation.lower()
            
        except Exception as e:
            self.logger.error(f"Answer checking failed: {str(e)}")
            # Fallback to basic checking
            return str(user_answer).strip().lower() in correct_explanation.lower()
    
    def cleanup_session_queue_requests(self, session_id):
        """
        Clean up any pending requests for a specific session.
        
        Args:
            session_id: The session ID to clean up requests for
        """
        if session_id in self.LLM_SESSION_REQUESTS:
            # Mark the requests as "canceled" so workers don't waste time processing them
            for request_id in self.LLM_SESSION_REQUESTS[session_id]:
                self.LLM_RESPONSE_MAP[request_id] = {"error": "Session ended", "canceled": True}
            # Remove session tracking
            del self.LLM_SESSION_REQUESTS[session_id]
            self.logger.info(f"Cleaned up queue requests for session {session_id}")
    
    def _generate_mock_questions(self, prompt):
        """
        Generate mock questions when LLM API is unavailable.
        
        Args:
            prompt: The original prompt to generate questions for
            
        Returns:
            dict: Mock questions response in expected format
        """
        # Log critical message when using mock questions
        logging.critical("LLM API unavailable - Using mock questions as fallback. This indicates LLM service failure.")
        
        # Extract topic from prompt or use generic
        topic = "general"
        if "math" in prompt.lower():
            topic = "math"
        elif "puzzle" in prompt.lower():
            topic = "puzzles"
        elif "story" in prompt.lower() or "reading" in prompt.lower():
            topic = "stories"
        elif "english" in prompt.lower() or "grammar" in prompt.lower():
            topic = "english"
        elif "science" in prompt.lower():
            topic = "science"
        elif "history" in prompt.lower():
            topic = "history"
        elif "geography" in prompt.lower():
            topic = "geography"
        
        mock_questions = {
            "math": [
                {
                    "question": "If you have 12 apples and give away 5 apples, how many apples do you have left?",
                    "hint": "Subtraction: Start with the total and take away what you gave.",
                    "explanation": "12 - 5 = 7. You started with 12 apples and gave away 5, so you have 7 apples remaining."
                },
                {
                    "question": "What is 8 × 7?",
                    "hint": "Think of multiplication as repeated addition: 8 + 8 + 8 + 8 + 8 + 8 + 8",
                    "explanation": "8 × 7 = 56. You can think of this as adding 8 seven times, or 7 eight times."
                }
            ],
            "puzzles": [
                {
                    "question": "I have keys but no locks. I have space but no room. You can enter but not go outside. What am I?",
                    "hint": "Think about something you use every day that has keys and space.",
                    "explanation": "A keyboard! It has keys (letter keys), space (spacebar), and you can enter (Enter key) but not go outside."
                },
                {
                    "question": "What comes next in this pattern: 2, 4, 6, 8, ?",
                    "hint": "Look at the difference between each number.",
                    "explanation": "10. This is a pattern of even numbers, each increasing by 2."
                }
            ],
            "stories": [
                {
                    "question": "Read this sentence: 'The brave knight saved the princess from the dragon.' Who saved the princess?",
                    "hint": "Look for the subject of the sentence - who performed the action?",
                    "explanation": "The knight saved the princess. The knight is the subject who performed the action of saving."
                }
            ],
            "english": [
                {
                    "question": "Which word is a noun in this sentence: 'The happy dog ran quickly'?",
                    "hint": "A noun is a person, place, or thing.",
                    "explanation": "'Dog' is the noun. Nouns name people, places, or things. 'Happy' is an adjective, 'ran' is a verb, and 'quickly' is an adverb."
                }
            ],
            "science": [
                {
                    "question": "What are the three states of matter?",
                    "hint": "Think about ice, water, and steam - what are their different forms?",
                    "explanation": "The three states of matter are solid, liquid, and gas. Ice is solid, water is liquid, and steam is gas."
                }
            ],
            "history": [
                {
                    "question": "Who was the first President of the United States?",
                    "hint": "This person is often called the 'Father of His Country'.",
                    "explanation": "George Washington was the first President of the United States, serving from 1789 to 1797."
                }
            ],
            "geography": [
                {
                    "question": "What is the largest ocean on Earth?",
                    "hint": "This ocean borders Asia, Australia, and the Americas.",
                    "explanation": "The Pacific Ocean is the largest ocean on Earth, covering about one-third of the planet's surface."
                }
            ]
        }
        
        questions = mock_questions.get(topic, mock_questions["math"])
        return {"questions": questions[:2]}  # Return 2 questions
    
    def _start_worker_threads(self):
        """Start the LLM worker threads."""
        for i in range(self.MAX_WORKER_THREADS):
            thread = threading.Thread(target=self._llm_worker, daemon=True)
            thread.start()
            self.WORKER_THREADS.append(thread)
    
    def _start_cleanup_thread(self):
        """Start the periodic cleanup thread."""
        cleanup_thread = threading.Thread(target=self._periodic_queue_cleanup, daemon=True)
        cleanup_thread.start()
        self.WORKER_THREADS.append(cleanup_thread)
    
    def _llm_worker(self):
        """Worker thread for processing LLM requests."""
        while True:
            try:
                # Get request from queue
                request_id, prompt, user_history, session_id, username = self.LLM_REQUEST_QUEUE.get(timeout=1)
                
                # Check if this session is still valid or if user has logged out
                if session_id and username:
                    session_valid = False
                    for active_username, user_session in self.active_sessions.items():
                        if active_username == username and user_session.get('session_id') == session_id:
                            session_valid = True
                            break
                    
                    if not session_valid:
                        self.logger.warning(f"Processing request for expired session: {session_id}")
                        # Still process but with low priority by briefly yielding
                        time.sleep(0.1)
                
                # Process normal LLM API call or answer check based on prompt content
                if isinstance(prompt, str) and "Question:" in prompt and "Student's Answer:" in prompt:
                    # This is an answer checking request
                    self._process_answer_check_request(request_id, prompt)
                else:
                    # This is a regular LLM API call for generating questions
                    self._process_question_generation_request(request_id, prompt, user_history)
                
                self.LLM_REQUEST_QUEUE.task_done()
            except queue.Empty:
                # Queue is empty, just continue
                continue
            except Exception as e:
                self.logger.error(f"LLM worker error: {str(e)}")
                time.sleep(1)  # Backoff before retrying
    
    def _periodic_queue_cleanup(self):
        """Periodically clean up abandoned queue requests."""
        while True:
            try:
                # Sleep for 5 minutes between cleanups
                time.sleep(300)
                
                # Get current active session IDs
                active_session_ids = set()
                for username, user_session in self.active_sessions.items():
                    active_session_ids.add(user_session.get('session_id'))
                
                # Find and clean up abandoned session requests
                abandoned_sessions = []
                for session_id in self.LLM_SESSION_REQUESTS:
                    if session_id not in active_session_ids:
                        abandoned_sessions.append(session_id)
                
                # Clean up abandoned sessions
                for session_id in abandoned_sessions:
                    self.cleanup_session_queue_requests(session_id)
                    self.logger.warning(f"Cleaned up abandoned session requests for {session_id}")
            
            except Exception as e:
                self.logger.error(f"Error in periodic queue cleanup: {str(e)}")
    
    def _process_answer_check_request(self, request_id, prompt):
        """Process answer checking request for both DeepSeek and OpenAI."""
        try:
            if self.model_type == 'deepseek':
                self._process_deepseek_answer_check(request_id, prompt)
            elif self.model_type == 'openai':
                self._process_openai_answer_check(request_id, prompt)
            else:
                self.logger.error(f"Unknown model type: {self.model_type}")
                self.LLM_RESPONSE_MAP[request_id] = {"error": f"Unknown model type: {self.model_type}"}
        except Exception as e:
            self.logger.error(f"Answer check processing error: {str(e)}")
            self.LLM_RESPONSE_MAP[request_id] = {"error": str(e)}
    
    def _process_question_generation_request(self, request_id, prompt, user_history):
        """Process question generation request for both DeepSeek and OpenAI."""
        try:
            if self.model_type == 'deepseek':
                self._process_deepseek_question_generation(request_id, prompt, user_history)
            elif self.model_type == 'openai':
                self._process_openai_question_generation(request_id, prompt, user_history)
            else:
                self.logger.error(f"Unknown model type: {self.model_type}")
                self.LLM_RESPONSE_MAP[request_id] = self._generate_mock_questions(prompt)
        except Exception as e:
            self.logger.error(f"LLM request processing error: {str(e)}")
            self.LLM_RESPONSE_MAP[request_id] = self._generate_mock_questions(prompt)
    
    def _process_deepseek_answer_check(self, request_id, prompt):
        """Process answer checking using DeepSeek API."""
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': f'Bearer {self.LLM_API_KEY}'
        }
        
        payload = {
            "messages": [
                {
                    "role": "system",
                    "content": "You are an expert teacher evaluating student answers. Be fair but accurate in your assessment."
                },
                {
                    "role": "user", 
                    "content": prompt
                }
            ],
            "model": "deepseek-chat",
            "max_tokens": 200,
            "temperature": 0.1,
            "stream": False
        }
        
        retry_count = 0
        while retry_count < self.MAX_RETRIES:
            try:
                response = requests.post(self.LLM_ENDPOINT, headers=headers, json=payload)
                response.raise_for_status()
                response_data = response.json()
                self.LLM_RESPONSE_MAP[request_id] = response_data
                break
            except (requests.exceptions.RequestException, json.JSONDecodeError) as e:
                retry_count += 1
                if retry_count >= self.MAX_RETRIES:
                    self.logger.error(f"DeepSeek answer check failed after {self.MAX_RETRIES} retries: {str(e)}")
                    self.LLM_RESPONSE_MAP[request_id] = {"error": str(e)}
                else:
                    time.sleep(1)  # Wait before retrying
    
    def _process_openai_answer_check(self, request_id, prompt):
        """Process answer checking using OpenAI API."""
        retry_count = 0
        while retry_count < self.MAX_RETRIES:
            try:
                completion = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "system",
                            "content": "You are an expert teacher evaluating student answers. Be fair but accurate in your assessment."
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    max_tokens=200,
                    temperature=0.1
                )
                
                # Convert OpenAI response format to match DeepSeek format
                response_data = {
                    "choices": [
                        {
                            "message": {
                                "content": completion.choices[0].message.content
                            }
                        }
                    ]
                }
                self.LLM_RESPONSE_MAP[request_id] = response_data
                break
            except Exception as e:
                retry_count += 1
                if retry_count >= self.MAX_RETRIES:
                    self.logger.error(f"OpenAI answer check failed after {self.MAX_RETRIES} retries: {str(e)}")
                    self.LLM_RESPONSE_MAP[request_id] = {"error": str(e)}
                else:
                    time.sleep(1)  # Wait before retrying
    
    def _process_deepseek_question_generation(self, request_id, prompt, user_history):
        """Process question generation using DeepSeek API."""
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': f'Bearer {self.LLM_API_KEY}'
        }
        
        # Include user history for difficulty adjustment
        enhanced_prompt = f"{prompt}\n\nUser History: {json.dumps(user_history[-10:])}" if user_history else prompt
        
        payload = {
            "messages": [
                {
                    "role": "system",
                    "content": "You are an expert educational content creator. Always respond with valid JSON only, no additional text or markdown formatting."
                },
                {
                    "role": "user", 
                    "content": enhanced_prompt
                }
            ],
            "model": "deepseek-chat",
            "max_tokens": 2048,
            "temperature": 0.7,
            "stream": False,
            "response_format": {
                "type": "text"
            }
        }
        
        retry_count = 0
        while retry_count < self.MAX_RETRIES:
            try:
                response = requests.post(self.LLM_ENDPOINT, headers=headers, json=payload)
                response.raise_for_status()
                
                # Extract content from DeepSeek response format
                response_data = response.json()
                content = response_data['choices'][0]['message']['content']
                
                # Clean the content - remove markdown code blocks if present
                content = content.strip()
                if content.startswith('```json'):
                    content = content[7:]  # Remove ```json
                if content.startswith('```'):
                    content = content[3:]   # Remove ```
                if content.endswith('```'):
                    content = content[:-3]  # Remove trailing ```
                content = content.strip()
                
                # Try to parse as JSON
                try:
                    parsed_response = json.loads(content)
                    self.LLM_RESPONSE_MAP[request_id] = parsed_response
                except json.JSONDecodeError as je:
                    self.logger.warning(f"DeepSeek JSON decode error: {str(je)}. Content: {content[:200]}...")
                    # Fallback to mock questions
                    self.LLM_RESPONSE_MAP[request_id] = self._generate_mock_questions(prompt)
                break
            except (requests.exceptions.RequestException, json.JSONDecodeError) as e:
                retry_count += 1
                if retry_count >= self.MAX_RETRIES:
                    self.logger.error(f"DeepSeek question generation failed after {self.MAX_RETRIES} retries: {str(e)}")
                    self.LLM_RESPONSE_MAP[request_id] = self._generate_mock_questions(prompt)
                else:
                    time.sleep(1)  # Wait before retrying
    
    def _process_openai_question_generation(self, request_id, prompt, user_history):
        """Process question generation using OpenAI API."""
        # Include user history for difficulty adjustment
        enhanced_prompt = f"{prompt}\n\nUser History: {json.dumps(user_history[-10:])}" if user_history else prompt
        
        retry_count = 0
        while retry_count < self.MAX_RETRIES:
            try:
                completion = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "system",
                            "content": "You are an expert educational content creator. Always respond with valid JSON only, no additional text or markdown formatting."
                        },
                        {
                            "role": "user",
                            "content": enhanced_prompt
                        }
                    ],
                    max_tokens=4000,  # Higher token limit for OpenAI to handle question generation
                    temperature=0.7,
                    response_format={"type": "json_object"}  # Force JSON response
                )
                
                content = completion.choices[0].message.content
                
                # Clean the content - remove markdown code blocks if present
                content = content.strip()
                if content.startswith('```json'):
                    content = content[7:]  # Remove ```json
                if content.startswith('```'):
                    content = content[3:]   # Remove ```
                if content.endswith('```'):
                    content = content[:-3]  # Remove trailing ```
                content = content.strip()
                
                # Try to parse as JSON
                try:
                    parsed_response = json.loads(content)
                    self.LLM_RESPONSE_MAP[request_id] = parsed_response
                except json.JSONDecodeError as je:
                    self.logger.warning(f"OpenAI JSON decode error: {str(je)}. Content: {content[:200]}...")
                    # Fallback to mock questions
                    self.LLM_RESPONSE_MAP[request_id] = self._generate_mock_questions(prompt)
                break
            except Exception as e:
                retry_count += 1
                if retry_count >= self.MAX_RETRIES:
                    self.logger.error(f"OpenAI question generation failed after {self.MAX_RETRIES} retries: {str(e)}")
                    self.LLM_RESPONSE_MAP[request_id] = self._generate_mock_questions(prompt)
                else:
                    time.sleep(1)  # Wait before retrying
    
    def generate_learning_content(self, topic, subtopic_name, subtopic_description, grade, session_id=None, username=None):
        """
        Generate educational learning content with explanations and examples.
        
        Args:
            topic: The main topic (math, english, science, etc.)
            subtopic_name: Name of the specific subtopic
            subtopic_description: Description of the subtopic
            grade: Grade level for age-appropriate content
            session_id: Current session ID for tracking
            username: Username for logging and session management
            
        Returns:
            dict: Learning content response with questions, explanations, and examples
        """
        # Static prompt for learning content generation
        learning_prompt = f"""Generate 5 educational questions for {topic} at grade {grade} level focusing on {subtopic_name}: {subtopic_description}.

**Do Not Invent Anything. And Do Not Provide Rude or Abusive Questions or Explanation For Any Topic. Do Not Repeat Same Type Of Questions.**

For each question, provide:
1. A clear, grade-appropriate question that covers difficult concepts within this subtopic
2. A detailed explanation that breaks down the concept step-by-step
3. At least one concrete example that illustrates the concept
4. Additional context that helps students understand why this concept is important

Ensure questions are educational, age-appropriate, and directly related to the specified grade level and subtopic. Focus on helping students understand challenging aspects of this topic through clear explanations and practical examples.

Format the response as JSON with the following structure:
{{
  "questions": [
    {{
      "question": "Question text",
      "explanation": "Detailed explanation with examples",
      "examples": ["Example 1", "Example 2"],
      "context": "Why this concept matters"
    }}
  ]
}}"""

        # Check if API is available based on model type
        api_available = False
        if self.model_type == 'deepseek':
            api_available = bool(self.LLM_ENDPOINT and self.LLM_API_KEY)
        elif self.model_type == 'openai':
            api_available = bool(self.openai_client and self.OPENAI_API_KEY)
        
        if not api_available:
            # Generate mock learning content for development
            return self._generate_mock_learning_content(topic, subtopic_name, grade)
        
        # Generate a unique request ID
        request_id = str(uuid.uuid4())
        
        try:
            # Put request in queue with session context
            self.LLM_REQUEST_QUEUE.put((request_id, learning_prompt, [], session_id, username))
            
            # Register this request with the session if session exists
            if session_id:
                if session_id not in self.LLM_SESSION_REQUESTS:
                    self.LLM_SESSION_REQUESTS[session_id] = []
                self.LLM_SESSION_REQUESTS[session_id].append(request_id)
            
            # Wait for response with timeout
            start_time = time.time()
            while time.time() - start_time < self.LLM_REQUEST_TIMEOUT:
                if request_id in self.LLM_RESPONSE_MAP:
                    response = self.LLM_RESPONSE_MAP[request_id]
                    # Clean up
                    del self.LLM_RESPONSE_MAP[request_id]
                    # Remove from session tracking if session exists
                    if session_id and session_id in self.LLM_SESSION_REQUESTS:
                        if request_id in self.LLM_SESSION_REQUESTS[session_id]:
                            self.LLM_SESSION_REQUESTS[session_id].remove(request_id)
                    return response
                time.sleep(0.1)  # Short sleep to prevent CPU hogging
            
            # Timeout occurred
            self.logger.warning(f"Learning content generation timed out after {self.LLM_REQUEST_TIMEOUT}s")
            # Clean up session tracking if session exists
            if session_id and session_id in self.LLM_SESSION_REQUESTS:
                if request_id in self.LLM_SESSION_REQUESTS[session_id]:
                    self.LLM_SESSION_REQUESTS[session_id].remove(request_id)
            return self._generate_mock_learning_content(topic, subtopic_name, grade)
            
        except Exception as e:
            self.logger.error(f"Learning content generation error: {str(e)}")
            return self._generate_mock_learning_content(topic, subtopic_name, grade)
    
    def _generate_mock_learning_content(self, topic, subtopic_name, grade):
        """
        Generate mock learning content when LLM API is unavailable.
        
        Args:
            topic: The main topic
            subtopic_name: Name of the specific subtopic
            grade: Grade level
            
        Returns:
            dict: Mock learning content in expected format
        """
        # Log critical message when using mock learning content
        logging.critical("LLM API unavailable - Using mock learning content as fallback. This indicates LLM service failure.")
        
        mock_content_by_topic = {
            "math": [
                {
                    "question": f"What are the key concepts in {subtopic_name} for grade {grade} students?",
                    "explanation": f"In {subtopic_name}, students learn fundamental mathematical concepts that build upon previous knowledge. This includes understanding number relationships, problem-solving strategies, and practical applications. The key is to break down complex problems into smaller, manageable steps and use visual aids or manipulatives when possible.",
                    "examples": [
                        "Example 1: When solving word problems, identify what you know and what you need to find first.",
                        "Example 2: Use drawings or objects to represent mathematical concepts visually."
                    ],
                    "context": f"Understanding {subtopic_name} is important because it provides the foundation for more advanced mathematical concepts and helps develop logical thinking skills that are useful in everyday life."
                },
                {
                    "question": f"How can students practice {subtopic_name} effectively?",
                    "explanation": f"Effective practice of {subtopic_name} involves regular review, applying concepts to real-world situations, and gradually increasing difficulty. Students should start with concrete examples before moving to abstract concepts, and always check their work by using different methods or reversing operations.",
                    "examples": [
                        "Example 1: Practice with everyday objects before using numbers only.",
                        "Example 2: Check addition problems by using subtraction."
                    ],
                    "context": "Regular practice helps build confidence and automaticity, making it easier to tackle more challenging problems in the future."
                }
            ],
            "english": [
                {
                    "question": f"What are the essential elements of {subtopic_name} for grade {grade}?",
                    "explanation": f"In {subtopic_name}, students develop language skills through reading, writing, speaking, and listening activities. This includes vocabulary development, understanding grammar rules, and learning to express ideas clearly and effectively. Students should focus on reading diverse texts and practicing writing in different formats.",
                    "examples": [
                        "Example 1: Read books from different genres to expand vocabulary and understanding.",
                        "Example 2: Practice writing short stories, letters, and reports to develop different writing skills."
                    ],
                    "context": f"Mastering {subtopic_name} is crucial for academic success across all subjects and for effective communication in daily life."
                },
                {
                    "question": f"How can students improve their {subtopic_name} skills?",
                    "explanation": f"Improvement in {subtopic_name} comes through consistent practice, reading widely, and actively using new vocabulary in speaking and writing. Students should also learn to edit their own work and seek feedback from teachers and peers.",
                    "examples": [
                        "Example 1: Keep a vocabulary journal with new words and their meanings.",
                        "Example 2: Read aloud to improve pronunciation and fluency."
                    ],
                    "context": "Strong language skills are essential for academic achievement and successful communication throughout life."
                }
            ],
            "science": [
                {
                    "question": f"What scientific concepts are covered in {subtopic_name} for grade {grade}?",
                    "explanation": f"In {subtopic_name}, students explore scientific phenomena through observation, experimentation, and inquiry. This includes understanding scientific methods, making predictions, collecting data, and drawing conclusions. Students learn to think like scientists by asking questions and seeking evidence-based answers.",
                    "examples": [
                        "Example 1: Conduct simple experiments to test hypotheses.",
                        "Example 2: Use scientific tools like magnifying glasses and measuring instruments."
                    ],
                    "context": f"Learning {subtopic_name} helps students understand the natural world and develop critical thinking skills essential for scientific literacy."
                },
                {
                    "question": f"How can students apply {subtopic_name} knowledge in real life?",
                    "explanation": f"Students can apply {subtopic_name} concepts by making connections between classroom learning and everyday experiences. This includes observing patterns in nature, understanding how things work, and making informed decisions based on scientific evidence.",
                    "examples": [
                        "Example 1: Observe weather patterns and predict changes.",
                        "Example 2: Understand how simple machines make work easier in daily life."
                    ],
                    "context": "Understanding science helps students make sense of the world around them and prepares them for future learning in STEM fields."
                }
            ]
        }
        
        # Get appropriate content based on topic, or use general content
        content_list = mock_content_by_topic.get(topic.lower(), mock_content_by_topic["math"])
        
        # Add more generic content to reach 5 items
        while len(content_list) < 5:
            content_list.append({
                "question": f"What are some study strategies for {subtopic_name}?",
                "explanation": f"Effective study strategies for {subtopic_name} include breaking down complex topics into smaller parts, using visual aids, practicing regularly, and connecting new learning to previous knowledge. Students should also ask questions when they don't understand something.",
                "examples": [
                    "Example 1: Create mind maps or diagrams to organize information.",
                    "Example 2: Practice explaining concepts to someone else."
                ],
                "context": "Good study habits help students learn more effectively and retain information longer."
            })
        
        return {
            "questions": content_list[:5]  # Return exactly 5 items
        }