"""
Unit test for Criteria 8: No dependency on JSON files for data persistence

This test verifies that the application no longer depends on JSON files
for data persistence and uses only SQLite database operations.

Tests:
1. Verify no JSON file fallback mechanisms exist in app.py functions
2. Verify SQLite-only data persistence operations
3. Verify proper error handling without JSON fallbacks
4. Verify application behavior when SQLite is the only persistence method

The test does not change database or code - it only verifies the implementation.
"""

import unittest
import tempfile
import shutil
import os
import sys
import inspect
import ast
from unittest.mock import patch, MagicMock

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestNoJSONDependency(unittest.TestCase):
    """Test that JSON file dependencies have been removed (Criteria 8)."""
    
    def setUp(self):
        """Set up test environment."""
        self.temp_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test environment."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_app_functions_no_json_fallback(self):
        """Test that app.py functions don't contain JSON file fallback code."""
        import app
        
        # List of functions that should not have JSON fallbacks
        functions_to_check = [
            'load_credentials',
            'save_credentials', 
            'get_user',
            'create_user',
            'authenticate_user',
            'update_user_history',
            'load_collaboration_data',
            'save_collaboration_data',
            'init_credentials_db',
            'init_collaboration_db'
        ]
        
        for func_name in functions_to_check:
            with self.subTest(function=func_name):
                # Get function source code
                func = getattr(app, func_name)
                source = inspect.getsource(func)
                
                # Check that source doesn't contain actual JSON file operations
                # (not including comments that explain fallbacks were removed)
                json_indicators = [
                    'json.load',
                    'json.dump', 
                    'with open(',
                    'CREDENTIALS_FILE',
                    'COLLABORATION_FILE',
                    '.json',
                    'except FileNotFoundError',
                    'json.loads',
                    'json.dumps'
                ]
                
                for indicator in json_indicators:
                    self.assertNotIn(indicator, source, 
                        f"Function {func_name} should not contain JSON fallback code: '{indicator}'")
    
    def test_sqlite_only_persistence_operations(self):
        """Test that persistence operations use only SQLite."""
        from dbmgr.sqlite_app_integration import SQLiteAppIntegration
        from flask import Flask
        
        # Create minimal Flask app for testing
        app = Flask(__name__)
        app.config['SECRET_KEY'] = 'test-key'
        
        # Create temporary database
        test_db_path = os.path.join(self.temp_dir, 'test.db')
        
        # Initialize SQLite integration
        integration = SQLiteAppIntegration(app, db_path=test_db_path)
        
        # Test that all basic operations work with SQLite only
        try:
            # Test user operations
            user_created = integration.create_user("test@example.com", "test_password", "Test School")
            self.assertTrue(user_created, "Should be able to create user with SQLite only")
            
            user_data = integration.get_user("test@example.com")
            self.assertIsNotNone(user_data, "Should be able to retrieve user with SQLite only")
            self.assertEqual(user_data['email'], "test@example.com")
            
            # Test collaboration operations  
            collab_data = integration.load_collaboration_data()
            self.assertIsInstance(collab_data, dict, "Should load collaboration data from SQLite")
            self.assertIn('invites', collab_data)
            self.assertIn('chat_sessions', collab_data)
            
            # Test saving collaboration data
            test_collab_data = {
                'invites': {
                    'test_invite': {
                        'from_user': 'test@example.com', 
                        'to_user': 'user2@example.com', 
                        'status': 'pending',
                        'timestamp': '2025-01-01 12:00:00'  # Add required timestamp
                    }
                },
                'chat_sessions': {},
                'message_counter': 0
            }
            save_result = integration.save_collaboration_data(test_collab_data)
            self.assertTrue(save_result, "Should be able to save collaboration data to SQLite")
            
            # Verify data was saved
            loaded_collab = integration.load_collaboration_data()
            self.assertIn('test_invite', loaded_collab['invites'])
            
        finally:
            integration._cleanup()
    
    def test_no_json_file_creation(self):
        """Test that no JSON files are created during normal operations."""
        from dbmgr.sqlite_app_integration import SQLiteAppIntegration
        from flask import Flask
        
        # Create Flask app
        app = Flask(__name__)
        app.config['SECRET_KEY'] = 'test-key'
        
        # Use temporary directory that we can monitor
        test_db_path = os.path.join(self.temp_dir, 'test.db')
        
        # Track files before operations
        files_before = set(os.listdir(self.temp_dir)) if os.path.exists(self.temp_dir) else set()
        
        try:
            # Initialize and perform operations
            integration = SQLiteAppIntegration(app, db_path=test_db_path)
            
            # Perform various operations
            integration.create_user("test@example.com", "password", "School")
            integration.get_user("test@example.com")
            integration.save_collaboration_data({'invites': {}, 'chat_sessions': {}, 'message_counter': 0})
            integration.load_collaboration_data()
            
            # Check files after operations
            files_after = set(os.listdir(self.temp_dir))
            new_files = files_after - files_before
            
            # Verify no JSON files were created
            json_files = [f for f in new_files if f.endswith('.json')]
            self.assertEqual(len(json_files), 0, 
                f"No JSON files should be created. Found: {json_files}")
            
            # Should only have SQLite database files
            db_files = [f for f in new_files if f.startswith('test.db')]
            self.assertGreater(len(db_files), 0, "Should have SQLite database files")
            
        finally:
            if 'integration' in locals():
                integration._cleanup()
    
    def test_error_handling_without_json_fallback(self):
        """Test that errors are handled properly without falling back to JSON."""
        import app
        from dbmgr.exceptions import DatabaseException
        
        # Mock get_app_db to raise an exception
        with patch('app.get_app_db') as mock_get_db:
            mock_get_db.side_effect = Exception("SQLite connection failed")
            
            # Test that functions raise DatabaseException instead of falling back to JSON
            with self.assertRaises(DatabaseException):
                app.load_credentials()
            
            with self.assertRaises(DatabaseException):
                app.save_credentials({'test': 'data'})
            
            with self.assertRaises(DatabaseException):
                app.get_user("test@example.com")
            
            with self.assertRaises(DatabaseException):
                app.create_user("test@example.com", {'password': 'test'})
            
            with self.assertRaises(DatabaseException):
                app.load_collaboration_data()
            
            with self.assertRaises(DatabaseException):
                app.save_collaboration_data({'test': 'data'})
    
    def test_source_code_analysis_for_json_removal(self):
        """Analyze source code to ensure JSON dependencies are removed."""
        import app
        
        # Get the source code of app.py
        app_source = inspect.getsource(app)
        
        # Parse the AST to find function definitions
        tree = ast.parse(app_source)
        
        function_definitions = []
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                function_definitions.append(node.name)
        
        # Check specific functions for JSON-related code
        critical_functions = [
            'load_credentials', 'save_credentials',
            'load_collaboration_data', 'save_collaboration_data', 
            'get_user', 'create_user', 'authenticate_user'
        ]
        
        for func_name in critical_functions:
            with self.subTest(function=func_name):
                self.assertIn(func_name, function_definitions, 
                    f"Function {func_name} should exist")
                
                # Get function source
                func = getattr(app, func_name)
                func_source = inspect.getsource(func)
                
                # Should not contain actual JSON file operations
                # (comments explaining removal are acceptable)
                forbidden_patterns = [
                    'json.load(',
                    'json.dump(',
                    'with open(',
                    'json.loads(',
                    'json.dumps(',
                    'FileNotFoundError',
                    'CREDENTIALS_FILE',
                    'COLLABORATION_FILE'
                ]
                
                for pattern in forbidden_patterns:
                    self.assertNotIn(pattern, func_source,
                        f"Function {func_name} should not contain '{pattern}' - JSON dependency found")
    
    def test_requirements_txt_includes_database_dependencies(self):
        """Test that requirements.txt documents all necessary database dependencies."""
        # Read requirements.txt
        requirements_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            'requirements.txt'
        )
        
        with open(requirements_path, 'r') as f:
            requirements_content = f.read()
        
        # Check that database dependencies are documented
        expected_comments = [
            'sqlite3',
            'threading', 
            'queue',
            'concurrent.futures',
            'contextlib',
            'pathlib',
            'Database dependencies'
        ]
        
        for comment in expected_comments:
            self.assertIn(comment, requirements_content,
                f"Requirements.txt should document '{comment}' as a database dependency")
        
        # Should not mention JSON for data persistence
        self.assertNotIn('json data persistence', requirements_content.lower(),
            "Requirements should not mention JSON for data persistence")


if __name__ == '__main__':
    print("🧪 Testing Criteria 8: No dependency on JSON files for data persistence")
    print("=" * 70)
    
    # Run the tests
    unittest.main(verbosity=2)
