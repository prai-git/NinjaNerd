import unittest
from unittest.mock import patch, MagicMock, Mock
import sys
import os
import json
import tempfile
import shutil
from datetime import datetime

# Ensure project root is in sys.path for direct test execution
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class TestStatisticsPage(unittest.TestCase):
    def setUp(self):
        """Set up test environment with temporary database"""
        self.test_dir = tempfile.mkdtemp()
        self.data_dir = os.path.join(self.test_dir, 'data')
        self.backup_dir = os.path.join(self.test_dir, 'backups')
        os.makedirs(self.data_dir, exist_ok=True)
        os.makedirs(self.backup_dir, exist_ok=True)
        
        # Create test credentials file with comprehensive history
        self.credentials_file = os.path.join(self.data_dir, 'Credentials.json')
        test_data = {
            "testuser@example.com": {
                "password": "hashed_password",
                "school_name": "Test School",
                "history": [
                    # Grade 3 Math questions (most math questions)
                    {"question": "What is 2+2?", "user_answer": "4", "correct": True, "topic": "math", "grade": 3, "timestamp": "2025-08-01T10:00:00"},
                    {"question": "What is 3+3?", "user_answer": "6", "correct": True, "topic": "math", "grade": 3, "timestamp": "2025-08-01T10:01:00"},
                    {"question": "What is 5+5?", "user_answer": "9", "correct": False, "topic": "math", "grade": 3, "timestamp": "2025-08-01T10:02:00"},
                    
                    # Grade 3 English questions
                    {"question": "What is a noun?", "user_answer": "person", "correct": True, "topic": "english", "grade": 3, "timestamp": "2025-08-01T10:03:00"},
                    {"question": "What is a verb?", "user_answer": "action", "correct": True, "topic": "english", "grade": 3, "timestamp": "2025-08-01T10:04:00"},
                    
                    # Grade 3 Science questions
                    {"question": "What is H2O?", "user_answer": "water", "correct": True, "topic": "science", "grade": 3, "timestamp": "2025-08-01T10:05:00"},
                    
                    # Grade 3 History questions
                    {"question": "Who was first president?", "user_answer": "Washington", "correct": True, "topic": "history", "grade": 3, "timestamp": "2025-08-01T10:06:00"},
                    {"question": "When was independence?", "user_answer": "1776", "correct": False, "topic": "history", "grade": 3, "timestamp": "2025-08-01T10:07:00"},
                    
                    # Grade 3 Geography questions
                    {"question": "What is capital of USA?", "user_answer": "DC", "correct": True, "topic": "geography", "grade": 3, "timestamp": "2025-08-01T10:08:00"},
                    
                    # Grade 4 Math questions (fewer than grade 3)
                    {"question": "What is 8*7?", "user_answer": "56", "correct": True, "topic": "math", "grade": 4, "timestamp": "2025-08-01T11:00:00"},
                ],
                "created_at": "2025-08-01T00:00:00"
            },
            "user_no_math@example.com": {
                "password": "hashed_password",
                "school_name": "Test School",
                "history": [
                    {"question": "What is a noun?", "user_answer": "person", "correct": True, "topic": "english", "grade": 2, "timestamp": "2025-08-01T10:03:00"},
                ],
                "created_at": "2025-08-01T00:00:00"
            }
        }
        
        with open(self.credentials_file, 'w') as f:
            json.dump(test_data, f)
    
    def tearDown(self):
        """Clean up test environment"""
        shutil.rmtree(self.test_dir, ignore_errors=True)
    
    def test_statistics_calculation(self):
        """Test statistics calculation for user with math questions"""
        from dbmgr.app_integration import AppDBWrapper
        
        # Set up database
        db = AppDBWrapper(self.data_dir, self.backup_dir)
        user_data = db.get_user('testuser@example.com')
        self.assertIsNotNone(user_data)
        
        # Get user's history
        history = user_data.get('history', [])
        
        # Find the grade with most math questions
        grade_math_counts = {}
        for entry in history:
            if entry.get('topic') == 'math':
                grade = entry.get('grade')
                if grade:
                    grade_math_counts[grade] = grade_math_counts.get(grade, 0) + 1
        
        # Should be grade 3 with 3 math questions vs grade 4 with 1
        self.assertEqual(max(grade_math_counts, key=grade_math_counts.get), 3)
        selected_grade = 3
        
        # Calculate statistics for grade 3
        topics = ['math', 'english', 'science', 'history', 'geography']
        statistics = {}
        
        for topic in topics:
            topic_questions = [entry for entry in history 
                             if entry.get('topic') == topic and entry.get('grade') == selected_grade]
            
            if topic_questions:
                correct_count = sum(1 for entry in topic_questions if entry.get('correct'))
                total_count = len(topic_questions)
                percentage = (correct_count / total_count) * 100
                statistics[topic] = percentage
            else:
                statistics[topic] = 0
        
        # Verify statistics
        # Math: 2 correct out of 3 = 66.67%
        self.assertAlmostEqual(statistics['math'], 66.66666666666667, places=2)
        
        # English: 2 correct out of 2 = 100%
        self.assertEqual(statistics['english'], 100.0)
        
        # Science: 1 correct out of 1 = 100%
        self.assertEqual(statistics['science'], 100.0)
        
        # History: 1 correct out of 2 = 50%
        self.assertEqual(statistics['history'], 50.0)
        
        # Geography: 1 correct out of 1 = 100%
        self.assertEqual(statistics['geography'], 100.0)
    
    def test_statistics_no_math_questions(self):
        """Test statistics calculation for user with no math questions"""
        from dbmgr.app_integration import AppDBWrapper
        
        # Set up database
        db = AppDBWrapper(self.data_dir, self.backup_dir)
        user_data = db.get_user('user_no_math@example.com')
        self.assertIsNotNone(user_data)
        
        # Get user's history
        history = user_data.get('history', [])
        
        # Find the grade with most math questions
        grade_math_counts = {}
        for entry in history:
            if entry.get('topic') == 'math':
                grade = entry.get('grade')
                if grade:
                    grade_math_counts[grade] = grade_math_counts.get(grade, 0) + 1
        
        # Should default to grade 1 (no math questions)
        if not grade_math_counts:
            selected_grade = 1
        else:
            selected_grade = max(grade_math_counts, key=grade_math_counts.get)
        
        self.assertEqual(selected_grade, 1)
        
        # Calculate statistics for grade 1 (should all be 0)
        topics = ['math', 'english', 'science', 'history', 'geography']
        statistics = {}
        
        for topic in topics:
            topic_questions = [entry for entry in history 
                             if entry.get('topic') == topic and entry.get('grade') == selected_grade]
            
            if topic_questions:
                correct_count = sum(1 for entry in topic_questions if entry.get('correct'))
                total_count = len(topic_questions)
                percentage = (correct_count / total_count) * 100
                statistics[topic] = percentage
            else:
                statistics[topic] = 0
        
        # All should be 0 for grade 1
        for topic in topics:
            self.assertEqual(statistics[topic], 0)
    
    def test_user_not_found(self):
        """Test with nonexistent user"""
        from dbmgr.app_integration import AppDBWrapper
        
        # Set up database
        db = AppDBWrapper(self.data_dir, self.backup_dir)
        user_data = db.get_user('nonexistent@example.com')
        self.assertIsNone(user_data)


if __name__ == '__main__':
    unittest.main()
