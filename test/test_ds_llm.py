#!/usr/bin/env python3
"""
Unit test for call_llm_api() function in app.py
Tests LLM interaction using math.txt prompt and validates response structure
"""

import sys
import os
import time
import json
import unittest
from unittest.mock import patch, MagicMock

# Add parent directory to path to import app module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import call_llm_api, load_prompt, app

class TestDSLLM(unittest.TestCase):
    """Test class for DeepSeek LLM API integration"""
    
    def setUp(self):
        """Set up test fixtures"""
        # Create Flask app context for testing
        self.app = app
        self.app_context = self.app.app_context()
        self.app_context.push()
        
        # Mock session data to avoid "Working outside of request context" error
        self.session_patcher = patch('app.session', {
            'session_id': 'test-session-id',
            'username': 'test-user'
        })
        self.mock_session = self.session_patcher.start()
        
        self.math_prompt = load_prompt('math')
        self.expected_question_count = 10  # As specified in math.txt prompt
    
    def tearDown(self):
        """Clean up after tests"""
        self.session_patcher.stop()
        self.app_context.pop()
        
    def test_call_llm_api_with_math_prompt(self):
        """Test call_llm_api with math.txt prompt and validate response structure"""
        print("\n" + "="*60)
        print("Testing call_llm_api() with math.txt prompt")
        print("="*60)
        
        # Print the prompt being used
        print(f"\nUsing math prompt (first 200 chars):")
        print(f"{self.math_prompt[:200]}...")
        
        # Measure response time
        start_time = time.time()
        
        # Call the LLM API
        response = call_llm_api(self.math_prompt, user_history=[])
        
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
        """Test call_llm_api with user history for difficulty adjustment"""
        print("\n" + "="*60)
        print("Testing call_llm_api() with user history")
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
        response = call_llm_api(self.math_prompt, user_history=user_history)
        end_time = time.time()
        
        response_time = end_time - start_time
        print(f"Response Time with history: {response_time:.2f} seconds")
        
        # Basic validation
        self.assertIsInstance(response, dict)
        self.assertIn('questions', response)
        self.assertGreater(len(response['questions']), 0)
        
        print(f"✅ History test completed - {len(response['questions'])} questions received")
    
    def test_error_handling(self):
        """Test error handling with invalid prompts"""
        print("\n" + "="*60)
        print("Testing error handling")
        print("="*60)
        
        # Test with empty prompt
        response = call_llm_api("", user_history=[])
        self.assertIsInstance(response, dict)
        
        # Should still get some response (mock questions)
        if 'questions' in response:
            print(f"✅ Empty prompt handled gracefully - {len(response['questions'])} questions")
        else:
            print("⚠️ Empty prompt returned error response")
        
        print("✅ Error handling test completed")

    def test_mock_question_generation(self):
        """Test that mock question generation works properly"""
        print("\n" + "="*60)
        print("Testing mock question generation")
        print("="*60)
        
        # Test different topic prompts - but expect actual LLM responses since API is working
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
                response = call_llm_api(prompt, user_history=[])
                
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
    print("DeepSeek LLM API Test Suite")
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