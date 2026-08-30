"""
Test cases for the question processor and option shuffling functionality.

Tests verify that multiple choice options are properly shuffled while maintaining
correct answer tracking for different topics.
"""

import unittest
import sys
import os
from unittest.mock import Mock, patch

# Add the parent directory to the path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.question_processor import QuestionProcessor, shuffle_questions_for_topic


class TestQuestionProcessor(unittest.TestCase):
    """Test cases for QuestionProcessor functionality."""
    
    def setUp(self):
        """Set up test environment."""
        self.mock_logger = Mock()
        self.processor = QuestionProcessor(self.mock_logger)
    
    def test_init_with_logger(self):
        """Test QuestionProcessor initialization with custom logger."""
        self.assertEqual(self.processor.logger, self.mock_logger)
        self.assertEqual(self.processor.text_based_topics, {'puzzles', 'stories', 'games'})
    
    def test_init_without_logger(self):
        """Test QuestionProcessor initialization without logger."""
        with patch('logging.getLogger') as mock_get_logger:
            mock_default_logger = Mock()
            mock_get_logger.return_value = mock_default_logger
            
            processor = QuestionProcessor()
            mock_get_logger.assert_called_once_with('core.question_processor')
            self.assertEqual(processor.logger, mock_default_logger)
    
    def test_shuffle_empty_questions(self):
        """Test shuffling with empty questions list."""
        result = self.processor.shuffle_multiple_choice_options([], 'math')
        self.assertEqual(result, [])
        
        result = self.processor.shuffle_multiple_choice_options(None, 'math')
        self.assertEqual(result, None)
    
    def test_skip_text_based_topics(self):
        """Test that text-based topics are not shuffled."""
        questions = [
            {
                'question': 'What am I?',
                'answer': 'keyboard',
                'hint': 'I have keys',
                'explanation': 'A keyboard has keys'
            }
        ]
        
        for topic in ['puzzles', 'stories', 'games']:
            result = self.processor.shuffle_multiple_choice_options(questions, topic)
            self.assertEqual(result, questions)
            self.mock_logger.debug.assert_called_with(f"Skipping option shuffling for text-based topic: {topic}")
    
    def test_shuffle_multiple_choice_questions(self):
        """Test shuffling of multiple choice questions."""
        questions = [
            {
                'question': 'What is 2 + 2?',
                'options': ['3', '4', '5'],
                'correct_answer': 1,
                'hint': 'Simple addition',
                'explanation': '2 + 2 = 4'
            },
            {
                'question': 'What is 5 × 3?',
                'options': ['15', '12', '18'],
                'correct_answer': 0,
                'hint': 'Multiplication',
                'explanation': '5 × 3 = 15'
            }
        ]
        
        # Set random seed for predictable shuffling in tests
        import random
        random.seed(42)
        
        result = self.processor.shuffle_multiple_choice_options(questions, 'math')
        
        # Verify we get the same number of questions
        self.assertEqual(len(result), 2)
        
        # Verify question content is preserved
        for i, question in enumerate(result):
            self.assertIn('question', question)
            self.assertIn('options', question)
            self.assertIn('correct_answer', question)
            self.assertIn('hint', question)
            self.assertIn('explanation', question)
            
            # Verify options are shuffled (but contain same elements)
            original_options = set(questions[i]['options'])
            shuffled_options = set(question['options'])
            self.assertEqual(original_options, shuffled_options)
            
            # Verify correct answer index is valid and points to correct option
            correct_index = question['correct_answer']
            self.assertIsInstance(correct_index, int)
            self.assertGreaterEqual(correct_index, 0)
            self.assertLess(correct_index, len(question['options']))
            
            # Get the correct answer text from original and shuffled
            original_correct_text = questions[i]['options'][questions[i]['correct_answer']]
            shuffled_correct_text = question['options'][correct_index]
            self.assertEqual(original_correct_text, shuffled_correct_text)
    
    def test_non_multiple_choice_questions_unchanged(self):
        """Test that non-multiple choice questions are returned unchanged."""
        questions = [
            {
                'question': 'Explain photosynthesis',
                'hint': 'Think about plants and sunlight',
                'explanation': 'Process by which plants convert light to energy'
            },
            {
                'question': 'What is gravity?',
                'answer': 'Force that attracts objects',
                'explanation': 'Fundamental force of nature'
            }
        ]
        
        result = self.processor.shuffle_multiple_choice_options(questions, 'science')
        self.assertEqual(result, questions)
    
    def test_invalid_correct_answer_index(self):
        """Test handling of invalid correct_answer indices."""
        questions = [
            {
                'question': 'Test question',
                'options': ['A', 'B', 'C'],
                'correct_answer': 5,  # Invalid index
                'explanation': 'Test explanation'
            },
            {
                'question': 'Another test',
                'options': ['X', 'Y', 'Z'],
                'correct_answer': -1,  # Invalid index
                'explanation': 'Another explanation'
            }
        ]
        
        result = self.processor.shuffle_multiple_choice_options(questions, 'math')
        
        # Questions should be returned unchanged due to invalid indices
        self.assertEqual(result, questions)
        
        # Check that warnings were logged
        expected_warnings = [
            "Question 1 in math: Invalid correct_answer index 5, skipping shuffle",
            "Question 2 in math: Invalid correct_answer index -1, skipping shuffle"
        ]
        
        warning_calls = [call.args[0] for call in self.mock_logger.warning.call_args_list]
        for expected_warning in expected_warnings:
            self.assertIn(expected_warning, warning_calls)
    
    def test_invalid_options_format(self):
        """Test handling of invalid options format."""
        questions = [
            {
                'question': 'Test question',
                'options': None,  # Invalid options
                'correct_answer': 0,
                'explanation': 'Test explanation'
            },
            {
                'question': 'Another test',
                'options': [],  # Empty options
                'correct_answer': 0,
                'explanation': 'Another explanation'
            }
        ]
        
        result = self.processor.shuffle_multiple_choice_options(questions, 'english')
        
        # Questions should be returned unchanged due to invalid options
        self.assertEqual(result, questions)
    
    def test_shuffle_preserves_all_fields(self):
        """Test that shuffling preserves all question fields."""
        questions = [
            {
                'question': 'Capital of France?',
                'options': ['London', 'Paris', 'Rome'],
                'correct_answer': 1,
                'hint': 'City of lights',
                'explanation': 'Paris is the capital of France',
                'difficulty': 'easy',
                'category': 'geography',
                'custom_field': 'test_value'
            }
        ]
        
        result = self.processor.shuffle_multiple_choice_options(questions, 'geography')
        
        self.assertEqual(len(result), 1)
        shuffled_question = result[0]
        
        # Verify all original fields are preserved
        for key in questions[0].keys():
            self.assertIn(key, shuffled_question)
        
        # Verify custom fields are preserved
        self.assertEqual(shuffled_question['difficulty'], 'easy')
        self.assertEqual(shuffled_question['category'], 'geography')
        self.assertEqual(shuffled_question['custom_field'], 'test_value')
    
    def test_error_handling_in_shuffle(self):
        """Test error handling during shuffle process."""
        # Create a question that will cause an error during processing
        questions = [
            {
                'question': 'Valid question',
                'options': ['A', 'B', 'C'],
                'correct_answer': 1,
                'explanation': 'Valid explanation'
            }
        ]
        
        # Mock the _shuffle_single_question method to raise an exception
        with patch.object(self.processor, '_shuffle_single_question', side_effect=Exception("Test error")):
            result = self.processor.shuffle_multiple_choice_options(questions, 'math')
            
            # Should return original questions when error occurs
            self.assertEqual(result, questions)
            
            # Should log the error
            self.mock_logger.error.assert_called_once()
            error_message = self.mock_logger.error.call_args[0][0]
            self.assertIn("Error shuffling question 1 for topic math: Test error", error_message)
    
    def test_convenience_function(self):
        """Test the convenience function shuffle_questions_for_topic."""
        questions = [
            {
                'question': 'Test question',
                'options': ['A', 'B', 'C'],
                'correct_answer': 0,
                'explanation': 'Test explanation'
            }
        ]
        
        with patch('core.question_processor.get_question_processor') as mock_get_processor:
            mock_processor = Mock()
            mock_processor.shuffle_multiple_choice_options.return_value = questions
            mock_get_processor.return_value = mock_processor
            
            result = shuffle_questions_for_topic(questions, 'science', self.mock_logger)
            
            mock_get_processor.assert_called_once_with(self.mock_logger)
            mock_processor.shuffle_multiple_choice_options.assert_called_once_with(questions, 'science')
            self.assertEqual(result, questions)


class TestRandomnessDistribution(unittest.TestCase):
    """Test that shuffling produces good randomness distribution."""
    
    def setUp(self):
        """Set up test environment."""
        self.processor = QuestionProcessor()
    
    def test_shuffle_randomness(self):
        """Test that shuffling produces varied results over multiple runs."""
        question = {
            'question': 'Test question',
            'options': ['Option A', 'Option B', 'Option C'],
            'correct_answer': 1,  # Original correct answer is 'Option B'
            'explanation': 'Test explanation'
        }
        
        # Track where the correct answer ends up
        position_counts = {0: 0, 1: 0, 2: 0}
        num_trials = 300
        
        for _ in range(num_trials):
            result = self.processor._shuffle_single_question(question, 'math', 1)
            correct_index = result['correct_answer']
            position_counts[correct_index] += 1
            
            # Verify the correct answer text is still 'Option B'
            self.assertEqual(result['options'][correct_index], 'Option B')
        
        # Check that distribution is reasonably random (within reasonable bounds)
        # Each position should get roughly 1/3 of the trials (100 ± some tolerance)
        expected_per_position = num_trials / 3
        tolerance = expected_per_position * 0.3  # 30% tolerance
        
        for position, count in position_counts.items():
            self.assertGreater(count, expected_per_position - tolerance,
                             f"Position {position} got {count} occurrences, expected ~{expected_per_position}")
            self.assertLess(count, expected_per_position + tolerance,
                           f"Position {position} got {count} occurrences, expected ~{expected_per_position}")


if __name__ == '__main__':
    # Create logs directory if it doesn't exist
    os.makedirs('logs', exist_ok=True)
    
    print("Running QuestionProcessor tests...")
    print("=" * 60)
    
    unittest.main(verbosity=2)