#!/usr/bin/env python3
"""
Test suite for SafeLLMServiceFacade answer parsing functionality.
Verifies that user answer parsing works correctly to fix validation issues.
"""

import sys
import os
import unittest

# Add the parent directory to Python path to import core modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.safe_llm_facade import SafeLLMServiceFacade
import logging

class TestSafeLLMFacadeParsing(unittest.TestCase):
    """Test the answer parsing functionality in SafeLLMServiceFacade."""
    
    def setUp(self):
        """Set up test fixture with SafeLLMServiceFacade instance."""
        self.logger = logging.getLogger('test')
        self.facade = SafeLLMServiceFacade(logger=self.logger)
    
    def test_parse_option_a_format(self):
        """Test parsing of 'Option A: content' format."""
        user_answer = "Option A: 12 students"
        expected = "12 students"
        result = self.facade._parse_user_answer(user_answer)
        self.assertEqual(result, expected, 
                        f"Expected '{expected}', got '{result}' for input '{user_answer}'")
    
    def test_parse_option_b_format(self):
        """Test parsing of 'Option B: content' format."""
        user_answer = "Option B: 15 liters"
        expected = "15 liters"
        result = self.facade._parse_user_answer(user_answer)
        self.assertEqual(result, expected,
                        f"Expected '{expected}', got '{result}' for input '{user_answer}'")
    
    def test_parse_option_c_format(self):
        """Test parsing of 'Option C: content' format."""
        user_answer = "Option C: The quick brown fox"
        expected = "The quick brown fox"
        result = self.facade._parse_user_answer(user_answer)
        self.assertEqual(result, expected,
                        f"Expected '{expected}', got '{result}' for input '{user_answer}'")
    
    def test_parse_no_option_label(self):
        """Test that answers without option labels are unchanged."""
        user_answer = "42"
        expected = "42"
        result = self.facade._parse_user_answer(user_answer)
        self.assertEqual(result, expected,
                        f"Expected '{expected}', got '{result}' for input '{user_answer}'")
    
    def test_parse_with_punctuation(self):
        """Test that punctuation is preserved in content."""
        user_answer = "Option A: It increases the effort needed."
        expected = "It increases the effort needed."
        result = self.facade._parse_user_answer(user_answer)
        self.assertEqual(result, expected,
                        f"Expected '{expected}', got '{result}' for input '{user_answer}'")
    
    def test_parse_whitespace_normalization(self):
        """Test that multiple spaces are normalized to single spaces."""
        user_answer = "Option A:    12   students   prefer   baseball"
        expected = "12 students prefer baseball"
        result = self.facade._parse_user_answer(user_answer)
        self.assertEqual(result, expected,
                        f"Expected '{expected}', got '{result}' for input '{user_answer}'")
    
    def test_parse_json_braces_removal(self):
        """Test that malformed JSON braces are removed."""
        user_answer = "{Option A: 12 students}"
        expected = "12 students"
        result = self.facade._parse_user_answer(user_answer)
        self.assertEqual(result, expected,
                        f"Expected '{expected}', got '{result}' for input '{user_answer}'")
    
    def test_parse_non_string_input(self):
        """Test that non-string inputs are converted to strings."""
        user_answer = 42
        expected = "42"
        result = self.facade._parse_user_answer(user_answer)
        self.assertEqual(result, expected,
                        f"Expected '{expected}', got '{result}' for input '{user_answer}'")
    
    def test_parse_preserve_actual_punctuation(self):
        """Test that actual punctuation in content is preserved and not removed."""
        test_cases = [
            ("Option A: It's a beautiful day!", "It's a beautiful day!"),
            ("Option B: Hello, world. How are you?", "Hello, world. How are you?"),
            ("Option C: The answer is 3.14159 (pi).", "The answer is 3.14159 (pi)."),
            ("Option A: \"Yes,\" she said, \"I agree.\"", "\"Yes,\" she said, \"I agree.\""),
            ("Option B: E = mc²; therefore, energy equals mass.", "E = mc²; therefore, energy equals mass."),
            ("Option C: Items: apples, oranges, bananas.", "Items: apples, oranges, bananas."),
        ]
        
        for user_answer, expected in test_cases:
            with self.subTest(input=user_answer):
                result = self.facade._parse_user_answer(user_answer)
                self.assertEqual(result, expected,
                               f"Punctuation preservation failed: Expected '{expected}', got '{result}' for input '{user_answer}'")
                
                # Verify specific punctuation marks are preserved
                for punct in ["'", "!", ".", "?", "(", ")", "\"", ",", ";", ":", "²"]:
                    if punct in expected:
                        self.assertIn(punct, result, 
                                    f"Punctuation '{punct}' should be preserved in result '{result}'")

    def test_parse_sports_survey_scenario(self):
        """Test the specific scenario that caused the validation bug."""
        user_answer = "Option A: 12 students"
        expected = "12 students"
        result = self.facade._parse_user_answer(user_answer)
        self.assertEqual(result, expected,
                        f"Sports survey scenario failed: Expected '{expected}', got '{result}'")
        
        # Verify the parsed answer would match expected content
        self.assertIn("12", result, "Parsed answer should contain the number 12")
        self.assertIn("students", result, "Parsed answer should contain 'students'")
        self.assertNotIn("Option A", result, "Parsed answer should NOT contain 'Option A'")

def run_tests():
    """Run all parsing tests and return success status."""
    print("=== SafeLLMServiceFacade Answer Parsing Tests ===\n")
    
    # Create test suite
    suite = unittest.TestLoader().loadTestsFromTestCase(TestSafeLLMFacadeParsing)
    
    # Run tests with verbose output
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Print summary
    print(f"\n=== Test Summary ===")
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    
    if result.failures:
        print("\nFailures:")
        for test, traceback in result.failures:
            print(f"  {test}: {traceback}")
    
    if result.errors:
        print("\nErrors:")
        for test, traceback in result.errors:
            print(f"  {test}: {traceback}")
    
    success = len(result.failures) == 0 and len(result.errors) == 0
    
    if success:
        print("\n✅ All parsing tests passed! The validation fix should work correctly.")
    else:
        print("\n❌ Some tests failed. Please check the parsing implementation.")
    
    return success

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)