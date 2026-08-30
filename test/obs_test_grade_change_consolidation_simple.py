#!/usr/bin/env python3

import sys
import os
import unittest

class TestGradeChangeConsolidationCodeAnalysis(unittest.TestCase):
    """Test suite for verifying that grade change handling has been consolidated by analyzing the code."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.app_py_path = '/Users/praveenrai/Personal/Krishang/NinjaNerd/app.py'
        
        # Read the app.py file
        with open(self.app_py_path, 'r') as f:
            self.app_content = f.read()
    
    def test_enforce_grade_change_rules_function_exists(self):
        """Test that the enforce_grade_change_rules function exists."""
        self.assertIn('def enforce_grade_change_rules(', self.app_content)
        
    def test_old_duplicate_grade_change_patterns_removed(self):
        """Test that old duplicate grade change patterns have been removed."""
        # These patterns should not exist anymore as they've been centralized
        old_patterns = [
            'old_grade is not None and old_grade != grade',
            'User changed grade, end all active chats',
            'Check if user changed grade and end all chats if so'
        ]
        
        for pattern in old_patterns:
            self.assertNotIn(pattern, self.app_content, f"Old pattern '{pattern}' still found in code")
    
    def test_enforce_grade_change_rules_called_from_routes(self):
        """Test that routes use the centralized enforce_grade_change_rules function."""
        # Count calls to enforce_grade_change_rules
        enforce_calls = self.app_content.count('enforce_grade_change_rules(')
        
        # Should be called from multiple routes
        self.assertGreaterEqual(enforce_calls, 4, "enforce_grade_change_rules should be called from at least 4 routes")
        
    def test_end_all_user_chats_called_from_centralized_function(self):
        """Test that end_all_user_chats is called from the centralized function for grade changes."""
        # Find the enforce_grade_change_rules function
        function_start = self.app_content.find("def enforce_grade_change_rules(")
        self.assertNotEqual(function_start, -1, "enforce_grade_change_rules function not found")
        
        # Find the next function definition to get the end
        next_function_start = self.app_content.find("\ndef ", function_start + 1)
        function_content = self.app_content[function_start:next_function_start]
        
        # The centralized function should call end_all_user_chats
        self.assertIn('end_all_user_chats(username)', function_content,
                     "enforce_grade_change_rules should call end_all_user_chats when grade changes")
    
    def test_topics_route_uses_centralized_logic(self):
        """Test that topics route uses centralized grade change logic."""
        # Find the topics route
        topics_route_start = self.app_content.find("def topics(grade):")
        self.assertNotEqual(topics_route_start, -1, "topics route not found")
        
        # Find the next route definition to get the end of topics route
        next_route_start = self.app_content.find("@app.route(", topics_route_start + 1)
        topics_route = self.app_content[topics_route_start:next_route_start]
        
        # Should call enforce_grade_change_rules
        self.assertIn('enforce_grade_change_rules(', topics_route)
        
        # Should not have old patterns
        self.assertNotIn('old_grade', topics_route)
        
    def test_subtopics_route_uses_centralized_logic(self):
        """Test that subtopics route uses centralized grade change logic."""
        # Find the subtopics route
        subtopics_route_start = self.app_content.find("def subtopics(grade, topic):")
        self.assertNotEqual(subtopics_route_start, -1, "subtopics route not found")
        
        # Find the next route definition to get the end of subtopics route
        next_route_start = self.app_content.find("@app.route(", subtopics_route_start + 1)
        subtopics_route = self.app_content[subtopics_route_start:next_route_start]
        
        # Should call enforce_grade_change_rules
        self.assertIn('enforce_grade_change_rules(', subtopics_route)
        
        # Should not have old patterns
        self.assertNotIn('old_grade', subtopics_route)
        
    def test_exercise_route_uses_centralized_logic(self):
        """Test that exercise route uses centralized grade change logic."""
        # Find the exercise route
        exercise_route_start = self.app_content.find("def exercise(grade, topic):")
        self.assertNotEqual(exercise_route_start, -1, "exercise route not found")
        
        # Find the next route definition to get the end of exercise route
        next_route_start = self.app_content.find("@app.route(", exercise_route_start + 1)
        exercise_route = self.app_content[exercise_route_start:next_route_start]
        
        # Should call enforce_grade_change_rules
        self.assertIn('enforce_grade_change_rules(', exercise_route)
        
        # Should not have old patterns
        self.assertNotIn('old_grade', exercise_route)
        
    def test_exercise_with_subtopic_route_uses_centralized_logic(self):
        """Test that exercise_with_subtopic route uses centralized grade change logic."""
        # Find the exercise_with_subtopic route
        exercise_subtopic_route_start = self.app_content.find("def exercise_with_subtopic(grade, topic, subtopic):")
        self.assertNotEqual(exercise_subtopic_route_start, -1, "exercise_with_subtopic route not found")
        
        # Find the next route definition to get the end of exercise_with_subtopic route
        next_route_start = self.app_content.find("@app.route(", exercise_subtopic_route_start + 1)
        exercise_subtopic_route = self.app_content[exercise_subtopic_route_start:next_route_start]
        
        # Should call enforce_grade_change_rules
        self.assertIn('enforce_grade_change_rules(', exercise_subtopic_route)
        
        # Should not have old patterns
        self.assertNotIn('old_grade', exercise_subtopic_route)
        
    def test_centralized_function_contains_proper_logic(self):
        """Test that the centralized function contains the proper grade change logic."""
        # Find the enforce_grade_change_rules function
        function_start = self.app_content.find("def enforce_grade_change_rules(")
        self.assertNotEqual(function_start, -1)
        
        # Find the next function definition to get the end
        next_function_start = self.app_content.find("\ndef ", function_start + 1)
        function_content = self.app_content[function_start:next_function_start]
        
        # Should contain proper logic
        self.assertIn('old_grade is not None and old_grade != new_grade', function_content)
        self.assertIn('end_all_user_chats(username)', function_content)
        self.assertIn('grade_changed', function_content)
        
    def test_session_management_properly_updated(self):
        """Test that session management is properly updated in centralized function."""
        # Find the enforce_grade_change_rules function
        function_start = self.app_content.find("def enforce_grade_change_rules(")
        next_function_start = self.app_content.find("\ndef ", function_start + 1)
        function_content = self.app_content[function_start:next_function_start]
        
        # Should update active sessions properly
        self.assertIn('active_sessions[username]', function_content)
        self.assertIn("'grade': new_grade", function_content)
        self.assertIn("'current_topic': topic", function_content)

def run_tests():
    """Run the test suite."""
    unittest.main(verbosity=2)

if __name__ == '__main__':
    run_tests()
