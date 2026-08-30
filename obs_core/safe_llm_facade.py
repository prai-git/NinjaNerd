"""
Safe LLM Service facade to handle graceful degradation when LLM service is not initialized.
Provides no-op implementations and structured error responses.
"""

import logging
import re
from typing import Dict, List, Any, Optional

class SafeLLMServiceFacade:
    """
    Facade that provides safe access to LLM service with graceful degradation.
    Returns structured error responses when the real service is unavailable.
    """
    
    def __init__(self, real_service=None, logger: Optional[logging.Logger] = None):
        self.real_service = real_service
        self.logger = logger or logging.getLogger(__name__)
        self._first_use_warning_logged = False
    
    def _log_first_use_warning(self):
        """Log warning on first use if service not initialized."""
        if not self._first_use_warning_logged:
            self.logger.warning(
                "LLM service accessed before initialization. "
                "Consider calling initialize_llm_service() during app startup."
            )
            self._first_use_warning_logged = True
    
    def _get_mock_response(self, error_msg: str = "LLM service not available") -> Dict[str, Any]:
        """Generate a structured mock response for when service is unavailable."""
        return {
            'status': 'error',
            'error': 'service_unavailable',
            'message': error_msg,
            'content': None,
            'fallback': True,
            'questions': [
                {
                    'question': 'A school is collecting data on how many books students read in a month. If 20 students read 2 books each, 15 students read 3 books each, and 10 students read 1 book each, how many books were read in total?',
                    'options': ['80', '90', '100'],
                    'correct_answer': 1,
                    'hint': 'Calculate each group separately then add them together.',
                    'explanation': '20 students × 2 books = 40 books, 15 students × 3 books = 45 books, 10 students × 1 book = 10 books. Total: 40 + 45 + 10 = 95 books. The closest answer is 90.'
                },
                {
                    'question': 'What is 8 × 7?',
                    'options': ['54', '56', '63'],
                    'correct_answer': 1,
                    'hint': 'Think of multiplication as repeated addition.',
                    'explanation': '8 × 7 = 56. You can think of this as adding 8 seven times.'
                },
                {
                    'question': 'A container can hold 5 liters of water. If you have 3 containers, how many liters can they hold in total?',
                    'options': ['10 liters', '15 liters', '20 liters'],
                    'correct_answer': 1,
                    'hint': 'Multiply the capacity of one container by the number of containers.',
                    'explanation': '5 liters × 3 containers = 15 liters total capacity.'
                }
            ]
        }
    
    def call_llm_api(self, prompt: str, user_history: List = None, session_id: str = None, username: str = None) -> Dict[str, Any]:
        """
        Safely call LLM API with graceful degradation.
        
        Args:
            prompt: The prompt to send to LLM
            user_history: List of previous interactions
            session_id: Session identifier
            username: User identifier
            
        Returns:
            Dict containing LLM response or mock data if service unavailable
        """
        if self.real_service is None:
            self._log_first_use_warning()
            return self._get_mock_response("LLM service not initialized")
        
        try:
            return self.real_service.call_llm_api(prompt, user_history or [], session_id, username)
        except Exception as e:
            self.logger.error(f"LLM API call failed: {str(e)}")
            return self._get_mock_response(f"LLM API call failed: {str(e)}")
    
    def generate_learning_content(self, topic: str, subtopic_name: str, subtopic_description: str, grade: str, session_id: str = None, username: str = None) -> Dict[str, Any]:
        """
        Safely generate learning content with graceful degradation.
        
        Args:
            topic: Learning topic
            subtopic_name: Name of the specific subtopic
            subtopic_description: Description of the subtopic
            grade: Grade level
            session_id: Session identifier
            username: User identifier
            
        Returns:
            Dict containing learning content or mock data if service unavailable
        """
        if self.real_service is None:
            self._log_first_use_warning()
            return self._get_mock_response("Learning content generation not available")
        
        try:
            return self.real_service.generate_learning_content(topic, subtopic_name, subtopic_description, grade, session_id, username)
        except Exception as e:
            self.logger.error(f"Learning content generation failed: {str(e)}")
            return self._get_mock_response(f"Learning content generation failed: {str(e)}")
    
    def check_answer_with_llm(self, question: str, user_answer: str, explanation: str, session_id: str = None, username: str = None) -> bool:
        """
        Safely check answer with graceful degradation.
        
        Args:
            question: The question text
            user_answer: User's submitted answer (can be option index or text answer)
            explanation: Expected explanation
            session_id: Session identifier
            username: User identifier
            
        Returns:
            bool: True for correct (defaults to False if service unavailable)
        """
        if self.real_service is None:
            self._log_first_use_warning()
            self.logger.info(f"Answer check unavailable - defaulting to incorrect for safety")
            return False
        
        try:
            # Parse and clean the user's answer to extract the actual content
            # Apply same sanitization logic as used in exercise.html frontend
            parsed_user_answer = self._parse_user_answer(user_answer)
            
            # Handle mocked services (for testing) - they have special attributes
            if hasattr(self.real_service, '_mock_name') or hasattr(self.real_service, 'check_answer_with_llm'):
                return self.real_service.check_answer_with_llm(question, parsed_user_answer, explanation, session_id, username)
            else:
                return self.real_service.check_answer_with_llm(question, parsed_user_answer, explanation, session_id, username)
        except Exception as e:
            self.logger.error(f"Answer checking failed: {str(e)}")
            # Default to False for safety when unable to verify
            return False
    
    def check_multiple_choice_answer(self, question_data: Dict[str, Any], selected_option_index: int) -> bool:
        """
        Check if selected multiple choice option is correct.
        
        Args:
            question_data: Dictionary containing question, options, and correct_answer
            selected_option_index: Index of the option selected by user
            
        Returns:
            bool: True if correct option was selected
        """
        try:
            correct_answer = question_data.get('correct_answer', -1)
            return selected_option_index == correct_answer
        except Exception as e:
            self.logger.error(f"Multiple choice answer checking failed: {str(e)}")
            return False
    
    def cleanup_session_queue_requests(self, session_id: str) -> None:
        """
        Safely cleanup session queue requests.
        
        Args:
            session_id: Session identifier to cleanup
        """
        if self.real_service is None:
            self._log_first_use_warning()
            return  # No-op if service not available
        
        try:
            self.real_service.cleanup_session_queue_requests(session_id)
        except Exception as e:
            self.logger.error(f"Session cleanup failed: {str(e)}")
    
    def set_active_sessions_reference(self, active_sessions: Dict) -> None:
        """
        Safely set active sessions reference.
        
        Args:
            active_sessions: Reference to active sessions dictionary
        """
        if self.real_service is None:
            self._log_first_use_warning()
            return  # No-op if service not available
        
        try:
            self.real_service.set_active_sessions_reference(active_sessions)
        except Exception as e:
            self.logger.error(f"Setting active sessions reference failed: {str(e)}")
    
    def is_available(self) -> bool:
        """Check if the real LLM service is available."""
        return self.real_service is not None
    
    def _parse_user_answer(self, user_answer: str) -> str:
        """
        Parse and clean user's answer using same logic as exercise.html frontend.
        Ensures proper comparison by extracting actual content while preserving punctuation.
        
        Args:
            user_answer: Raw user answer which may contain "Option A: content" format
            
        Returns:
            str: Cleaned answer content for LLM validation
        """
        if not isinstance(user_answer, str):
            return str(user_answer)
        
        clean_answer = user_answer
        
        # Remove curly braces only if they wrap the entire answer (malformed JSON)
        if clean_answer.startswith('{') and clean_answer.endswith('}'):
            clean_answer = clean_answer[1:-1]
        
        # Remove option labels like "Option A", "Option B", "Option C" at the start
        # This matches the exact regex used in exercise.html
        clean_answer = re.sub(r'^Option\s+[A-C]\s*:?\s*', '', clean_answer)
        
        # Clean up whitespace (normalize multiple spaces to single space)
        clean_answer = re.sub(r'\s+', ' ', clean_answer).strip()
        
        # ONLY if the answer still contains JSON field names, then it's malformed
        if any(field in clean_answer for field in ['correct_answer', 'hint', 'explanation']):
            # Extract the first meaningful sentence that doesn't contain JSON field names
            sentences = [s.strip() for s in clean_answer.split('.') if 
                        len(s.strip()) > 5 and 
                        not any(field in s for field in ['correct_answer', 'hint', 'explanation'])]
            if sentences:
                clean_answer = sentences[0]
        
        return clean_answer

    def initialize_service(self, real_service, logger: Optional[logging.Logger] = None):
        """
        Initialize with a real LLM service instance.
        
        Args:
            real_service: The actual LLM service instance
            logger: Optional logger instance
        """
        self.real_service = real_service
        if logger:
            self.logger = logger
        self.logger.info("LLM service facade initialized with real service")


# Global safe LLM service instance
_safe_llm_service: Optional[SafeLLMServiceFacade] = None

def get_safe_llm_service(logger: Optional[logging.Logger] = None) -> SafeLLMServiceFacade:
    """Get or create the global safe LLM service facade."""
    global _safe_llm_service
    if _safe_llm_service is None:
        _safe_llm_service = SafeLLMServiceFacade(logger=logger)
    return _safe_llm_service

def initialize_safe_llm_service(real_service=None, logger: Optional[logging.Logger] = None) -> SafeLLMServiceFacade:
    """Initialize the global safe LLM service facade with a real service."""
    global _safe_llm_service
    _safe_llm_service = SafeLLMServiceFacade(real_service, logger)
    return _safe_llm_service
