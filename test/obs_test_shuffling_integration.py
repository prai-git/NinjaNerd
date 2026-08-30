"""
Integration test for question shuffling with answer validation.

Tests the complete flow of shuffling questions and validating answers
to ensure the system works correctly end-to-end.
"""

import unittest
import sys
import os
from unittest.mock import Mock, patch, MagicMock
import json

# Add the parent directory to the path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.question_processor import shuffle_questions_for_topic
from core.safe_llm_facade import SafeLLMServiceFacade


class TestShufflingIntegration(unittest.TestCase):
    """Integration tests for question shuffling with answer validation."""
    
    def setUp(self):
        """Set up test environment."""
        self.mock_logger = Mock()
    
    def test_shuffled_answer_validation(self):
        """Test that answer validation works correctly with shuffled options."""
        # Create sample questions as they would come from LLM
        original_questions = [
            {
                'question': 'What is 2 + 2?',
                'options': ['3', '4', '5'],
                'correct_answer': 1,  # '4' is correct
                'hint': 'Simple addition',
                'explanation': '2 + 2 = 4'
            },
            {
                'question': 'What is 10 ÷ 2?',
                'options': ['5', '4', '6'],
                'correct_answer': 0,  # '5' is correct
                'hint': 'Division',
                'explanation': '10 ÷ 2 = 5'
            }
        ]
        
        # Shuffle the questions
        shuffled_questions = shuffle_questions_for_topic(original_questions, 'math', self.mock_logger)
        
        # Test each shuffled question
        for i, (original, shuffled) in enumerate(zip(original_questions, shuffled_questions)):
            with self.subTest(question_index=i):
                # Get the original correct answer text
                original_correct_text = original['options'][original['correct_answer']]
                
                # Get the shuffled correct answer text
                shuffled_correct_index = shuffled['correct_answer']
                shuffled_correct_text = shuffled['options'][shuffled_correct_index]
                
                # The correct answer text should be the same
                self.assertEqual(original_correct_text, shuffled_correct_text,
                               f"Question {i}: Correct answer text mismatch")
                
                # Test answer validation using SafeLLMServiceFacade
                facade = SafeLLMServiceFacade()
                
                # Test correct answer validation
                is_correct = facade.check_multiple_choice_answer(shuffled, shuffled_correct_index)
                self.assertTrue(is_correct, f"Question {i}: Correct answer should validate as true")
                
                # Test incorrect answer validation
                for wrong_index in range(len(shuffled['options'])):
                    if wrong_index != shuffled_correct_index:
                        is_incorrect = facade.check_multiple_choice_answer(shuffled, wrong_index)
                        self.assertFalse(is_incorrect, 
                                       f"Question {i}: Wrong answer at index {wrong_index} should validate as false")
    
    def test_text_based_topics_unchanged(self):
        """Test that text-based topics (puzzles, stories, games) are not shuffled."""
        text_questions = [
            {
                'question': 'I have keys but no locks. What am I?',
                'hint': 'Think about something you use daily',
                'explanation': 'A keyboard has keys but no locks'
            }
        ]
        
        for topic in ['puzzles', 'stories', 'games']:
            with self.subTest(topic=topic):
                result = shuffle_questions_for_topic(text_questions, topic, self.mock_logger)
                self.assertEqual(result, text_questions, 
                               f"Text-based topic {topic} should not be shuffled")
    
    def test_mixed_question_types(self):
        """Test shuffling with mixed question types (some MC, some text)."""
        mixed_questions = [
            {
                'question': 'What is 3 × 4?',
                'options': ['12', '10', '14'],
                'correct_answer': 0,
                'explanation': '3 × 4 = 12'
            },
            {
                'question': 'Explain photosynthesis',
                'hint': 'Process in plants',
                'explanation': 'Plants convert sunlight to energy'
            },
            {
                'question': 'What is the capital of Spain?',
                'options': ['Barcelona', 'Madrid', 'Valencia'],
                'correct_answer': 1,
                'explanation': 'Madrid is the capital of Spain'
            }
        ]
        
        shuffled = shuffle_questions_for_topic(mixed_questions, 'science', self.mock_logger)
        
        # First question should be shuffled (has options)
        self.assertIn('options', shuffled[0])
        self.assertIn('correct_answer', shuffled[0])
        # Options should contain same elements (but possibly in different order)
        self.assertEqual(set(shuffled[0]['options']), set(mixed_questions[0]['options']))
        
        # Second question should be unchanged (no options)
        self.assertEqual(shuffled[1], mixed_questions[1])
        
        # Third question should be shuffled (has options)
        self.assertIn('options', shuffled[2])
        self.assertIn('correct_answer', shuffled[2])
        self.assertEqual(set(shuffled[2]['options']), set(mixed_questions[2]['options']))
    
    def test_answer_validation_workflow(self):
        """Test the complete workflow from question generation to answer validation."""
        # Simulate LLM response
        llm_response = {
            'questions': [
                {
                    'question': 'Which of these is a primary color?',
                    'options': ['Green', 'Red', 'Orange'],
                    'correct_answer': 1,  # 'Red' is correct
                    'explanation': 'Red is one of the three primary colors'
                }
            ]
        }
        
        # Shuffle the questions (as would happen in app.py)
        shuffled_questions = shuffle_questions_for_topic(
            llm_response['questions'], 'english', self.mock_logger
        )
        
        # Get the shuffled question
        question = shuffled_questions[0]
        correct_answer_index = question['correct_answer']
        correct_answer_text = question['options'][correct_answer_index]
        
        # Verify the correct answer is still 'Red'
        self.assertEqual(correct_answer_text, 'Red')
        
        # Simulate user selecting the correct answer
        facade = SafeLLMServiceFacade()
        is_correct = facade.check_multiple_choice_answer(question, correct_answer_index)
        self.assertTrue(is_correct)
        
        # Simulate user selecting wrong answers
        for i, option in enumerate(question['options']):
            if i != correct_answer_index:
                is_wrong = facade.check_multiple_choice_answer(question, i)
                self.assertFalse(is_wrong, f"Option '{option}' should be incorrect")
    
    def test_shuffle_preserves_question_integrity(self):
        """Test that shuffling preserves all question data integrity."""
        original_question = {
            'question': 'What is H2O?',
            'options': ['Oxygen', 'Water', 'Hydrogen'],
            'correct_answer': 1,
            'hint': 'Essential for life',
            'explanation': 'H2O is the chemical formula for water',
            'difficulty': 'medium',
            'category': 'chemistry',
            'tags': ['basic', 'formula']
        }
        
        shuffled = shuffle_questions_for_topic([original_question], 'science', self.mock_logger)
        shuffled_question = shuffled[0]
        
        # All original fields should be preserved
        self.assertEqual(shuffled_question['question'], original_question['question'])
        self.assertEqual(shuffled_question['hint'], original_question['hint'])
        self.assertEqual(shuffled_question['explanation'], original_question['explanation'])
        self.assertEqual(shuffled_question['difficulty'], original_question['difficulty'])
        self.assertEqual(shuffled_question['category'], original_question['category'])
        self.assertEqual(shuffled_question['tags'], original_question['tags'])
        
        # Options should contain the same elements
        self.assertEqual(set(shuffled_question['options']), set(original_question['options']))
        
        # Correct answer should still point to 'Water'
        correct_text = shuffled_question['options'][shuffled_question['correct_answer']]
        self.assertEqual(correct_text, 'Water')
    
    def test_error_recovery(self):
        """Test that error conditions are handled gracefully."""
        # Test with malformed questions
        malformed_questions = [
            {
                'question': 'Valid question',
                'options': ['A', 'B', 'C'],
                'correct_answer': 1
            },
            {
                'question': 'Invalid question',
                'options': None,  # Invalid options
                'correct_answer': 0
            },
            {
                'question': 'Another invalid',
                'options': ['X', 'Y'],
                'correct_answer': 5  # Invalid index
            }
        ]
        
        # Should not raise exceptions
        try:
            shuffled = shuffle_questions_for_topic(malformed_questions, 'math', self.mock_logger)
            self.assertEqual(len(shuffled), 3)  # All questions returned
            
            # Valid question should be shuffled
            self.assertIn('options', shuffled[0])
            self.assertEqual(set(shuffled[0]['options']), {'A', 'B', 'C'})
            
            # Invalid questions should be returned unchanged
            self.assertEqual(shuffled[1], malformed_questions[1])
            self.assertEqual(shuffled[2], malformed_questions[2])
            
        except Exception as e:
            self.fail(f"Shuffling should handle errors gracefully, but raised: {e}")


class TestShufflingStatistics(unittest.TestCase):
    """Test statistical properties of the shuffling algorithm."""
    
    def test_randomness_distribution(self):
        """Test that shuffling produces a good distribution of correct answer positions."""
        question = {
            'question': 'Test question',
            'options': ['Option A', 'Option B', 'Option C'],
            'correct_answer': 1,  # 'Option B' is correct
            'explanation': 'Test explanation'
        }
        
        # Track where the correct answer ends up over many shuffles
        position_counts = {0: 0, 1: 0, 2: 0}
        num_trials = 300
        
        for _ in range(num_trials):
            shuffled = shuffle_questions_for_topic([question], 'math')
            correct_index = shuffled[0]['correct_answer']
            position_counts[correct_index] += 1
            
            # Verify the correct answer is still 'Option B'
            correct_text = shuffled[0]['options'][correct_index]
            self.assertEqual(correct_text, 'Option B')
        
        # Check distribution is reasonably uniform
        expected_per_position = num_trials / 3
        tolerance = expected_per_position * 0.25  # 25% tolerance
        
        for position, count in position_counts.items():
            self.assertGreater(count, expected_per_position - tolerance,
                             f"Position {position} underrepresented: {count} vs expected ~{expected_per_position}")
            self.assertLess(count, expected_per_position + tolerance,
                           f"Position {position} overrepresented: {count} vs expected ~{expected_per_position}")
        
        print(f"Distribution over {num_trials} trials: {position_counts}")
        print(f"Expected per position: ~{expected_per_position:.1f}")


if __name__ == '__main__':
    print("Running Question Shuffling Integration Tests...")
    print("=" * 60)
    
    unittest.main(verbosity=2)