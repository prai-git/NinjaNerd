"""
Question processing utilities for handling multiple choice randomization.

This module provides functionality to shuffle multiple choice options
while maintaining correct answer tracking for enhanced learning experience.
"""

import random
import logging
from typing import List, Dict, Any, Optional

class QuestionProcessor:
    """Handles processing and randomization of questions."""
    
    def __init__(self, logger: Optional[logging.Logger] = None):
        """Initialize the question processor.
        
        Args:
            logger: Optional logger instance. If None, uses default logger.
        """
        self.logger = logger or logging.getLogger(__name__)
        # Topics that should NOT have shuffled options (text-based questions)
        self.text_based_topics = {'puzzles', 'stories', 'games'}
    
    def shuffle_multiple_choice_options(self, questions: List[Dict[str, Any]], topic: str) -> List[Dict[str, Any]]:
        """
        Shuffle multiple choice options for questions to randomize correct answer positions.
        
        Args:
            questions: List of question dictionaries from LLM
            topic: The topic name (to determine if shuffling should be applied)
            
        Returns:
            List of questions with shuffled options (if applicable)
        """
        if not questions:
            return questions
            
        # Skip shuffling for text-based topics
        if topic.lower() in self.text_based_topics:
            self.logger.debug(f"Skipping option shuffling for text-based topic: {topic}")
            return questions
        
        shuffled_questions = []
        
        for i, question in enumerate(questions):
            try:
                shuffled_question = self._shuffle_single_question(question, topic, i + 1)
                shuffled_questions.append(shuffled_question)
            except Exception as e:
                self.logger.error(f"Error shuffling question {i + 1} for topic {topic}: {str(e)}")
                # Return original question if shuffling fails
                shuffled_questions.append(question)
        
        self.logger.info(f"Successfully shuffled {len(shuffled_questions)} multiple choice questions for topic: {topic}")
        return shuffled_questions
    
    def _shuffle_single_question(self, question: Dict[str, Any], topic: str, question_num: int) -> Dict[str, Any]:
        """
        Shuffle options for a single question.
        
        Args:
            question: Single question dictionary
            topic: Topic name for logging
            question_num: Question number for logging
            
        Returns:
            Question with shuffled options
        """
        # Make a copy to avoid modifying original
        shuffled_question = question.copy()
        
        # Check if this is a multiple choice question
        if not ('options' in question and 'correct_answer' in question):
            # Not a multiple choice question, return as-is
            return shuffled_question
            
        options = question.get('options', [])
        correct_answer_index = question.get('correct_answer', -1)
        
        # Validate inputs
        if not isinstance(options, list) or len(options) == 0:
            self.logger.warning(f"Question {question_num} in {topic}: No valid options found, skipping shuffle")
            return shuffled_question
            
        if not isinstance(correct_answer_index, int) or correct_answer_index < 0 or correct_answer_index >= len(options):
            self.logger.warning(f"Question {question_num} in {topic}: Invalid correct_answer index {correct_answer_index}, skipping shuffle")
            return shuffled_question
        
        # Create indexed list to track original positions
        indexed_options = [(i, option) for i, option in enumerate(options)]
        
        # Shuffle the indexed options
        random.shuffle(indexed_options)
        
        # Extract shuffled options and find new position of correct answer
        shuffled_options = [option for _, option in indexed_options]
        new_correct_index = None
        
        for new_index, (original_index, _) in enumerate(indexed_options):
            if original_index == correct_answer_index:
                new_correct_index = new_index
                break
        
        # Update the question with shuffled data
        shuffled_question['options'] = shuffled_options
        shuffled_question['correct_answer'] = new_correct_index
        
        # Log the shuffle for debugging
        self.logger.debug(f"Question {question_num} in {topic}: Shuffled options. "
                         f"Original correct answer at index {correct_answer_index} -> "
                         f"New correct answer at index {new_correct_index}")
        
        return shuffled_question


# Global instance for use throughout the application
_question_processor: Optional[QuestionProcessor] = None

def get_question_processor(logger: Optional[logging.Logger] = None) -> QuestionProcessor:
    """Get or create the global question processor instance."""
    global _question_processor
    if _question_processor is None:
        _question_processor = QuestionProcessor(logger)
    return _question_processor

def shuffle_questions_for_topic(questions: List[Dict[str, Any]], topic: str, logger: Optional[logging.Logger] = None) -> List[Dict[str, Any]]:
    """
    Convenience function to shuffle questions for a specific topic.
    
    Args:
        questions: List of questions from LLM
        topic: Topic name
        logger: Optional logger instance
        
    Returns:
        List of questions with shuffled options
    """
    processor = get_question_processor(logger)
    return processor.shuffle_multiple_choice_options(questions, topic)