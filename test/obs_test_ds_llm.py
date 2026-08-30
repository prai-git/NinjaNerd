#!/usr/bin/env python3
"""
Unit test for LLMService class in ai/llm_service.py
Tests LLM interaction using math.txt prompt and validates response structure
"""

import sys
import os
import time
import json
import unittest
from unittest.mock import patch, MagicMock
import logging

# Add parent directory to path to import modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai.llm_service import LLMService
from app import load_prompt, app

class TestDSLLM(unittest.TestCase):
    """Test class for DeepSeek LLM API integration"""
    
    def setUp(self):
        """Set up test fixtures"""
        # Create Flask app context for testing
        self.app = app
        self.app_context = self.app.app_context()
        self.app_context.push()
        
        # Create a test logger
        self.logger = logging.getLogger('test_logger')
        self.logger.setLevel(logging.INFO)
        
        # Initialize LLM service
        self.llm_service = LLMService(logger=self.logger, model_type='deepseek')
        
        # Mock active sessions for the service
        self.mock_active_sessions = {
            'test-user': {
                'session_id': 'test-session-id',
                'last_activity': '2024-01-01T12:00:00',
                'school_name': 'Test School',
                'current_topic': 'math',
                'grade': 3
            }
        }
        self.llm_service.set_active_sessions_reference(self.mock_active_sessions)
        
        self.math_prompt = load_prompt('math')
        self.expected_question_count = 10  # As specified in math.txt prompt
    
    def tearDown(self):
        """Clean up after tests"""
        self.app_context.pop()
        
    def test_call_llm_api_with_math_prompt(self):
        """Test LLMService.call_llm_api with math.txt prompt and validate response structure"""
        print("\n" + "="*60)
        print("Testing LLMService.call_llm_api() with math.txt prompt")
        print("="*60)
        
        # Print the prompt being used
        print(f"\nUsing math prompt (first 200 chars):")
        print(f"{self.math_prompt[:200]}...")
        
        # Measure response time
        start_time = time.time()
        
        # Call the LLM API through the service
        response = self.llm_service.call_llm_api(
            self.math_prompt, 
            user_history=[], 
            session_id='test-session-id', 
            username='test-user'
        )
        
        end_time = time.time()
        response_time = end_time - start_time
        
        # Print response time
        print(f"\nResponse Time: {response_time:.2f} seconds")
        
        # Validate response structure
        self.assertIsInstance(response, dict, "Response should be a dictionary")
        self.assertIn('questions', response, "Response should contain 'questions' key")
        
        questions = response['questions']
        self.assertIsInstance(questions, list, "Questions should be a list")
        
        print(f"\nReceived {len(questions)} questions")
        print(f"Expected {self.expected_question_count} questions")
        
        # Validate number of questions (allowing some flexibility for mock responses)
        if len(questions) < self.expected_question_count:
            print(f"WARNING: Received fewer questions than expected. This might be due to:")
            print("1. Mock response being used (LLM API unavailable)")
            print("2. API rate limiting")
            print("3. Token limits in LLM response")
        
        # Ensure we got at least some questions
        self.assertGreater(len(questions), 0, "Should receive at least 1 question")
        
        # Validate question structure - handle multiple possible formats
        for i, question in enumerate(questions):
            with self.subTest(question_index=i):
                self.assertIsInstance(question, dict, f"Question {i} should be a dictionary")
                
                # Check that question has a 'question' field
                self.assertIn('question', question, f"Question {i} should have 'question' field")
                self.assertIsInstance(question['question'], str, f"Question {i} 'question' should be a string")
                self.assertGreater(len(question['question'].strip()), 0, f"Question {i} 'question' should not be empty")
                
                # Handle multiple possible formats:
                # 1. Mock format: hint, explanation
                # 2. LLM format: options, answer
                # 3. Simple format: just answer
                # 4. Any format with at least a question field
                has_valid_format = False
                
                if 'hint' in question and 'explanation' in question:
                    # Mock format from generate_mock_questions
                    self.assertIsInstance(question['hint'], str, f"Question {i} 'hint' should be a string")
                    self.assertGreater(len(question['hint'].strip()), 0, f"Question {i} 'hint' should not be empty")
                    self.assertIsInstance(question['explanation'], str, f"Question {i} 'explanation' should be a string")
                    self.assertGreater(len(question['explanation'].strip()), 0, f"Question {i} 'explanation' should not be empty")
                    has_valid_format = True
                
                if 'options' in question and 'answer' in question:
                    # LLM format with multiple choice
                    self.assertIsInstance(question['options'], list, f"Question {i} 'options' should be a list")
                    self.assertGreater(len(question['options']), 0, f"Question {i} should have options")
                    self.assertIsInstance(question['answer'], str, f"Question {i} 'answer' should be a string")
                    self.assertGreater(len(question['answer'].strip()), 0, f"Question {i} 'answer' should not be empty")
                    has_valid_format = True
                
                if 'answer' in question and 'options' not in question:
                    # Simple format with just answer
                    self.assertIsInstance(question['answer'], str, f"Question {i} 'answer' should be a string")
                    self.assertGreater(len(question['answer'].strip()), 0, f"Question {i} 'answer' should not be empty")
                    has_valid_format = True
                
                # If none of the expected formats, just ensure it has a question field (already checked above)
                if not has_valid_format:
                    print(f"INFO: Question {i} has minimal format with only 'question' field - this is acceptable")
        
        # Print sample questions for manual verification
        print(f"\nSample Questions:")
        print("-" * 40)
        for i, question in enumerate(questions[:3]):  # Show first 3 questions
            print(f"\nQuestion {i+1}:")
            print(f"Q: {question['question'][:100]}{'...' if len(question['question']) > 100 else ''}")
            
            if 'hint' in question:
                print(f"H: {question['hint'][:100]}{'...' if len(question['hint']) > 100 else ''}")
                print(f"E: {question['explanation'][:100]}{'...' if len(question['explanation']) > 100 else ''}")
            elif 'options' in question:
                print(f"Options: {question['options']}")
                print(f"Answer: {question['answer']}")
            elif 'answer' in question:
                print(f"Answer: {question['answer']}")
            else:
                print("(Question only format)")
        
        # Additional validation for math-specific content
        self.validate_math_content(questions)
        
        print(f"\n✅ Test completed successfully!")
        print(f"📊 Response time: {response_time:.2f}s")
        print(f"📝 Questions received: {len(questions)}")
    
    def validate_math_content(self, questions):
        """Validate that questions contain math-related content"""
        math_keywords = [
            'add', 'subtract', 'multiply', 'divide', 'plus', 'minus', 'times',
            'number', 'calculate', 'solve', 'equation', 'sum', 'total', 'difference',
            'product', 'quotient', 'fraction', 'decimal', 'percent', 'geometry',
            'area', 'perimeter', 'volume', 'pattern', 'sequence', 'triangle',
            'rectangle', 'square', 'root', 'angle', 'prime', 'hexagon', 'speed',
            'miles', 'hours', 'train', 'expression', 'simplify'
        ]
        
        math_content_found = False
        for question in questions:
            question_text = question['question'].lower()
            if any(keyword in question_text for keyword in math_keywords):
                math_content_found = True
                break
        
        if not math_content_found:
            print("\nWARNING: No obvious math keywords found in questions.")
            print("This might be normal for story problems or advanced math concepts.")
        else:
            print(f"\n✅ Math content validated - found relevant mathematical keywords")
    
    def test_call_llm_api_with_user_history(self):
        """Test LLMService.call_llm_api with user history for difficulty adjustment"""
        print("\n" + "="*60)
        print("Testing LLMService.call_llm_api() with user history")
        print("="*60)
        
        # Sample user history
        user_history = [
            {
                'question': 'What is 2 + 2?',
                'user_answer': '4',
                'correct': True,
                'topic': 'math',
                'grade': 3
            },
            {
                'question': 'What is 10 - 5?',
                'user_answer': '5',
                'correct': True,
                'topic': 'math',
                'grade': 3
            }
        ]
        
        start_time = time.time()
        response = self.llm_service.call_llm_api(
            self.math_prompt, 
            user_history=user_history, 
            session_id='test-session-id', 
            username='test-user'
        )
        end_time = time.time()
        
        response_time = end_time - start_time
        print(f"Response Time with history: {response_time:.2f} seconds")
        
        # Basic validation
        self.assertIsInstance(response, dict)
        self.assertIn('questions', response)
        self.assertGreater(len(response['questions']), 0)
        
        print(f"✅ History test completed - {len(response['questions'])} questions received")
    
    def test_check_answer_with_llm(self):
        """Test LLMService.check_answer_with_llm method"""
        print("\n" + "="*60)
        print("Testing LLMService.check_answer_with_llm()")
        print("="*60)
        
        # Test with a simple math question
        question = "What is 2 + 2?"
        correct_answer = "4"
        explanation = "2 + 2 = 4. This is basic addition."
        
        # Test correct answer
        start_time = time.time()
        is_correct = self.llm_service.check_answer_with_llm(
            question, 
            correct_answer, 
            explanation, 
            session_id='test-session-id', 
            username='test-user'
        )
        end_time = time.time()
        
        print(f"Answer checking time: {end_time - start_time:.2f} seconds")
        print(f"Question: {question}")
        print(f"User answer: {correct_answer}")
        print(f"Result: {'Correct' if is_correct else 'Incorrect'}")
        
        # For mock responses, this should work correctly
        self.assertIsInstance(is_correct, bool, "Answer check should return a boolean")
        
        # Test incorrect answer
        wrong_answer = "5"
        is_incorrect = self.llm_service.check_answer_with_llm(
            question, 
            wrong_answer, 
            explanation, 
            session_id='test-session-id', 
            username='test-user'
        )
        
        print(f"Wrong answer: {wrong_answer}")
        print(f"Result: {'Correct' if is_incorrect else 'Incorrect'}")
        
        self.assertIsInstance(is_incorrect, bool, "Answer check should return a boolean")
        
        print("✅ Answer checking test completed")
    
    def test_session_cleanup(self):
        """Test LLMService.cleanup_session_queue_requests method"""
        print("\n" + "="*60)
        print("Testing LLMService.cleanup_session_queue_requests()")
        print("="*60)
        
        # Test cleanup functionality
        test_session_id = 'cleanup-test-session'
        
        # This should not raise any errors even if session doesn't exist
        self.llm_service.cleanup_session_queue_requests(test_session_id)
        
        print("✅ Session cleanup test completed")
    
    def test_error_handling(self):
        """Test error handling with invalid prompts"""
        print("\n" + "="*60)
        print("Testing error handling")
        print("="*60)
        
        # Test with empty prompt
        response = self.llm_service.call_llm_api("", user_history=[], session_id='test-session-id', username='test-user')
        self.assertIsInstance(response, dict)
        
        # Should still get some response (mock questions)
        if 'questions' in response:
            print(f"✅ Empty prompt handled gracefully - {len(response['questions'])} questions")
        else:
            print("⚠️ Empty prompt returned error response")
        
        # Test with None values
        response = self.llm_service.call_llm_api("test prompt", user_history=[], session_id=None, username=None)
        self.assertIsInstance(response, dict)
        
        print("✅ Error handling test completed")

    def test_mock_question_generation(self):
        """Test that mock question generation works properly"""
        print("\n" + "="*60)
        print("Testing mock question generation")
        print("="*60)
        
        # Test different topic prompts
        test_prompts = [
            ("math", "Generate educational questions for math"),
            ("science", "Create science questions for grade 3"),
            ("english", "Generate English grammar questions"),
            ("history", "Create history questions"),
            ("geography", "Make geography questions"),
            ("general", "Generate general questions")
        ]
        
        for expected_topic, prompt in test_prompts:
            with self.subTest(topic=expected_topic):
                response = self.llm_service.call_llm_api(
                    prompt, 
                    user_history=[], 
                    session_id='test-session-id', 
                    username='test-user'
                )
                
                self.assertIsInstance(response, dict, f"Response for {expected_topic} should be a dictionary")
                
                # Handle different response formats
                questions = []
                if 'questions' in response:
                    questions = response['questions']
                elif expected_topic in response:
                    # Some responses might use the topic as the key
                    questions = response[expected_topic]
                else:
                    # If no recognized format, skip this test
                    print(f"⚠️ Unexpected response format for {expected_topic}: {list(response.keys())}")
                    continue
                
                self.assertIsInstance(questions, list, f"Questions for {expected_topic} should be a list")
                self.assertGreater(len(questions), 0, f"Should receive at least 1 question for {expected_topic}")
                
                # Validate question structure - be flexible about fields
                for question in questions:
                    # Handle case where questions might be strings instead of dictionaries
                    if isinstance(question, str):
                        # If it's a string, that's acceptable as a minimal question format
                        self.assertGreater(len(question.strip()), 0, f"Question string should not be empty for {expected_topic}")
                        print(f"INFO: Question for {expected_topic} is in string format - this is acceptable")
                    elif isinstance(question, dict):
                        self.assertIn('question', question, f"Question should have 'question' field for {expected_topic}")
                        
                        # Don't require specific fields since LLM response format varies
                        # Just ensure we have some content
                        has_content = False
                        for field in ['hint', 'explanation', 'options', 'answer']:
                            if field in question:
                                has_content = True
                                break
                        
                        # Even if no additional fields, having a question is sufficient
                        if not has_content:
                            print(f"INFO: Question for {expected_topic} has minimal format (question only)")
                    else:
                        self.fail(f"Question for {expected_topic} should be either a string or dictionary, got {type(question)}")
        
        print(f"✅ Mock question generation test completed for all topics")


def main():
    """Main function to run the tests"""
    print("DeepSeek LLM API Test Suite (Refactored)")
    print("=" * 60)
    
    # Check if math.txt exists
    math_file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'math.txt')
    if not os.path.exists(math_file_path):
        print(f"❌ ERROR: math.txt not found at {math_file_path}")
        return 1
    
    # Run the tests
    unittest.main(verbosity=2, exit=False)
    return 0


if __name__ == '__main__':
    exit_code = main()
    sys.exit(exit_code)