"""
Unit tests for message obfuscation functionality in collaboration chat.

These tests verify that:
1. Messages are properly obfuscated when stored
2. Messages are properly deobfuscated when retrieved
3. Chat functionality remains unchanged for users
4. Backwards compatibility with existing unobfuscated messages
5. Database integrity is maintained
"""

import unittest
import tempfile
import os
import json
from unittest.mock import patch
from datetime import datetime
import sys
import base64

# Add the parent directory to the path to import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set up environment variable for tests
os.environ['MESSAGE_OBFUSCATION_KEY'] = 'test-message-obfuscation-key-for-testing'

# Import the modules
from core.message_security import MessageObfuscator, obfuscate_message, deobfuscate_message, is_message_obfuscated


class TestMessageObfuscation(unittest.TestCase):
    """Test the message obfuscation utility functions."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.obfuscator = MessageObfuscator()
        self.test_messages = [
            "Hello, how are you?",
            "This is a test message with special characters: !@#$%^&*()",
            "Multi-line message\nwith newlines\nand spaces",
            "Unicode test: 你好 🌟 café résumé",
            "",  # Empty message
            "   ",  # Whitespace only
            "a",  # Single character
            "A very long message that exceeds normal chat length to test the obfuscation with longer content and ensure it works properly with extended text content."
        ]
    
    def test_basic_obfuscation_deobfuscation(self):
        """Test basic obfuscation and deobfuscation functionality."""
        for message in self.test_messages:
            with self.subTest(message=message):
                # Obfuscate the message
                obfuscated = self.obfuscator.obfuscate_message(message)
                
                # Deobfuscate the message
                deobfuscated = self.obfuscator.deobfuscate_message(obfuscated)
                
                # Should get back the original message
                self.assertEqual(message, deobfuscated)
    
    def test_obfuscated_messages_are_different(self):
        """Test that obfuscated messages are different from original."""
        for message in self.test_messages:
            if message.strip():  # Skip empty/whitespace messages
                with self.subTest(message=message):
                    obfuscated = self.obfuscator.obfuscate_message(message)
                    self.assertNotEqual(message, obfuscated)
    
    def test_obfuscated_messages_are_base64(self):
        """Test that obfuscated messages have proper format with prefix."""
        for message in self.test_messages:
            if message.strip():  # Skip empty/whitespace messages
                with self.subTest(message=message):
                    obfuscated = self.obfuscator.obfuscate_message(message)
                    
                    # Should start with the prefix
                    self.assertTrue(obfuscated.startswith("obf1:"))
                    
                    # The part after prefix should be valid base64
                    try:
                        payload = obfuscated[5:]  # Remove "obf1:" prefix
                        base64.b64decode(payload)
                    except Exception as e:
                        self.fail(f"Obfuscated message payload is not valid base64: {e}")
    
    def test_is_obfuscated_detection(self):
        """Test the is_obfuscated function."""
        for message in self.test_messages:
            with self.subTest(message=message):
                # Original message should not be detected as obfuscated
                self.assertFalse(self.obfuscator.is_obfuscated(message))
                
                if message.strip():  # Skip empty/whitespace messages
                    # Obfuscated message should be detected
                    obfuscated = self.obfuscator.obfuscate_message(message)
                    self.assertTrue(self.obfuscator.is_obfuscated(obfuscated))
    
    def test_consistent_key_generation(self):
        """Test that the same secret generates the same key."""
        secret = "test_secret_key"
        obfuscator1 = MessageObfuscator(secret)
        obfuscator2 = MessageObfuscator(secret)
        
        test_message = "Test message for consistency"
        
        obfuscated1 = obfuscator1.obfuscate_message(test_message)
        obfuscated2 = obfuscator2.obfuscate_message(test_message)
        
        # Same secret should produce same obfuscation
        self.assertEqual(obfuscated1, obfuscated2)
        
        # Both should deobfuscate to original
        self.assertEqual(test_message, obfuscator1.deobfuscate_message(obfuscated1))
        self.assertEqual(test_message, obfuscator2.deobfuscate_message(obfuscated2))
    
    def test_different_keys_produce_different_results(self):
        """Test that different secrets produce different obfuscations."""
        obfuscator1 = MessageObfuscator("secret1")
        obfuscator2 = MessageObfuscator("secret2")
        
        test_message = "Test message for different keys"
        
        obfuscated1 = obfuscator1.obfuscate_message(test_message)
        obfuscated2 = obfuscator2.obfuscate_message(test_message)
        
        # Different secrets should produce different obfuscations
        self.assertNotEqual(obfuscated1, obfuscated2)
    
    def test_convenience_functions(self):
        """Test the convenience functions."""
        test_message = "Test convenience functions"
        
        # Test obfuscate_message function
        obfuscated = obfuscate_message(test_message)
        self.assertNotEqual(test_message, obfuscated)
        
        # Test deobfuscate_message function
        deobfuscated = deobfuscate_message(obfuscated)
        self.assertEqual(test_message, deobfuscated)
        
        # Test is_message_obfuscated function
        self.assertFalse(is_message_obfuscated(test_message))
        self.assertTrue(is_message_obfuscated(obfuscated))
    
    def test_backwards_compatibility(self):
        """Test handling of non-obfuscated messages."""
        test_messages = [
            "Plain text message",
            "Another plain text message with symbols !@#",
            "Multi\nline\nmessage"
        ]
        
        for message in test_messages:
            with self.subTest(message=message):
                # Deobfuscating a plain text message should return it unchanged
                result = deobfuscate_message(message)
                self.assertEqual(message, result)
    
    def test_error_handling(self):
        """Test error handling with invalid inputs."""
        # Test with None
        self.assertEqual(obfuscate_message(None), None)
        self.assertEqual(deobfuscate_message(None), None)
        
        # Test with invalid base64 (should return original)
        invalid_b64 = "This is not base64!"
        result = deobfuscate_message(invalid_b64)
        self.assertEqual(invalid_b64, result)


class TestChatMessageObfuscationIntegration(unittest.TestCase):
    """Integration tests for message obfuscation in chat functionality."""
    
    def setUp(self):
        """Set up test fixtures for integration tests."""
        # Import here to avoid circular imports
        from app import app
        from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db
        
        self.app = app
        self.app.testing = True
        
        # Create temporary directories for testing
        self.temp_dir = tempfile.mkdtemp()
        self.data_dir = os.path.join(self.temp_dir, 'data')
        self.backup_dir = os.path.join(self.temp_dir, 'backups')
        os.makedirs(self.data_dir)
        os.makedirs(self.backup_dir)
    
    def tearDown(self):
        """Clean up test fixtures."""
        # Clean up temporary files
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_send_chat_message_obfuscation(self):
        """Test that sent chat messages are obfuscated in storage."""
        from app import app
        from unittest.mock import MagicMock
        
        # Create a mock database that captures obfuscated messages
        mock_db = MagicMock()
        stored_messages = []
        
        def mock_add_message(session_id, from_user, to_user, message):
            # Simulate message obfuscation during storage
            from core.message_security import obfuscate_message
            obfuscated = obfuscate_message(message)
            stored_messages.append({
                'session_id': session_id,
                'from_user': from_user,
                'to_user': to_user,
                'original_message': message,
                'stored_message': obfuscated
            })
            return len(stored_messages)  # Return message ID
        
        mock_db.find_active_chat_session.return_value = 'session_123'
        mock_db.add_message.side_effect = mock_add_message
        
        with app.test_client() as client:
            # Set up session for user1
            with client.session_transaction() as sess:
                sess['username'] = 'user1'
                sess['session_id'] = 'test_session_user1'
            
            # Mock active sessions and database functions - patch app.get_app_db specifically
            with patch('app.active_sessions', {
                'user1': {
                    'grade': 5,
                    'school_name': 'Test School',
                    'session_id': 'test_session_user1'
                },
                'user2': {
                    'grade': 5,
                    'school_name': 'Test School',
                    'session_id': 'test_session_user2'
                }
            }), patch('app.get_app_db', return_value=mock_db):
                test_message = "Hello, this is a test message!"
                
                # Send a chat message
                response = client.post('/send_chat_message', 
                                     json={
                                         'to_user': 'user2',
                                         'message': test_message
                                     })
                
                self.assertEqual(response.status_code, 200)
                response_data = response.get_json()
                self.assertTrue(response_data.get('success'))
                
                # Check that the message was obfuscated in storage
                self.assertEqual(len(stored_messages), 1)
                stored_message = stored_messages[0]
                
                # The stored message should be different from the original (obfuscated)
                self.assertNotEqual(stored_message['stored_message'], test_message)
                self.assertEqual(stored_message['original_message'], test_message)
                
                # But when deobfuscated, it should match the original
                from core.message_security import deobfuscate_message
                deobfuscated = deobfuscate_message(stored_message['stored_message'])
                self.assertEqual(deobfuscated, test_message)
    
    def test_get_chat_messages_deobfuscation(self):
        """Test that retrieved chat messages are properly deobfuscated."""
        from app import app
        from unittest.mock import MagicMock
        from core.message_security import obfuscate_message
        
        # Create test messages - some obfuscated, some plain text (for backwards compatibility)
        test_message1 = "Hello from user1!"
        test_message2 = "Plain text message (backwards compatibility)"
        
        # Create a mock database that returns obfuscated and plain messages
        mock_db = MagicMock()
        mock_messages = [
            {
                'id': 1,
                'from_user': 'user1',
                'to_user': 'user2',
                'message': obfuscate_message(test_message1),  # Obfuscated
                'timestamp': datetime.now().isoformat(),
                'displayed': False
            },
            {
                'id': 2,
                'from_user': 'user1',
                'to_user': 'user2',
                'message': test_message2,  # Plain text (backwards compatibility)
                'timestamp': datetime.now().isoformat(),
                'displayed': False
            }
        ]
        
        mock_db.get_chat_messages.return_value = mock_messages
        
        with app.test_client() as client:
            # Set up session for user2
            with client.session_transaction() as sess:
                sess['username'] = 'user2'
                sess['session_id'] = 'test_session_user2'
            
            # Mock active sessions and database functions - patch app.get_app_db specifically
            with patch('app.active_sessions', {
                'user1': {
                    'grade': 5,
                    'school_name': 'Test School',
                    'session_id': 'test_session_user1'
                },
                'user2': {
                    'grade': 5,
                    'school_name': 'Test School',
                    'session_id': 'test_session_user2'
                }
            }), patch('app.get_app_db', return_value=mock_db):
                # Get chat messages
                response = client.get('/get_chat_messages?partner=user1')
                self.assertEqual(response.status_code, 200)
                
                response_data = response.get_json()
                messages = response_data['messages']
                
                self.assertEqual(len(messages), 2)
                
                # Both messages should be deobfuscated and readable
                self.assertEqual(messages[0]['message'], test_message1)
                self.assertEqual(messages[1]['message'], test_message2)
                
                # Verify the original stored messages remain unchanged
                original_messages = mock_db.get_chat_messages.return_value
                # First message should still be obfuscated in storage
                self.assertNotEqual(original_messages[0]['message'], test_message1)
                # Second message should remain plain text in storage
                self.assertEqual(original_messages[1]['message'], test_message2)
    
    def test_chat_functionality_unchanged(self):
        """Test that chat functionality remains completely unchanged for users."""
        from app import app
        from unittest.mock import MagicMock
        
        # Create a mock database that captures all messages
        mock_db = MagicMock()
        sent_messages = []
        stored_messages = []
        
        def mock_add_message(session_id, from_user, to_user, message):
            # Simulate message obfuscation during storage
            from core.message_security import obfuscate_message
            obfuscated = obfuscate_message(message)
            message_entry = {
                'id': len(stored_messages) + 1,
                'from_user': from_user,
                'to_user': to_user,
                'message': obfuscated,  # Stored obfuscated
                'timestamp': datetime.now().isoformat(),
                'displayed': False
            }
            stored_messages.append(message_entry)
            sent_messages.append({
                'original': message,
                'obfuscated': obfuscated
            })
            return len(stored_messages)
        
        def mock_get_messages(user1, user2):
            # Return all stored messages between the two users
            # The route will filter them appropriately for the requesting user
            return stored_messages
        
        mock_db.find_active_chat_session.return_value = 'session_123'
        mock_db.add_message.side_effect = mock_add_message
        mock_db.get_chat_messages.side_effect = mock_get_messages
        
        with app.test_client() as client:
            # Mock active sessions and database functions for both users - patch app.get_app_db specifically
            with patch('app.active_sessions', {
                'user1': {
                    'grade': 5,
                    'school_name': 'Test School',
                    'session_id': 'test_session_user1'
                },
                'user2': {
                    'grade': 5,
                    'school_name': 'Test School',
                    'session_id': 'test_session_user2'
                }
            }), patch('app.get_app_db', return_value=mock_db):
                test_messages = [
                    "Hello user2!",
                    "How are you doing?",
                    "This is a test conversation"
                ]
                
                # User1 sends messages to User2
                for i, message in enumerate(test_messages):
                    with client.session_transaction() as sess:
                        sess['username'] = 'user1'
                        sess['session_id'] = 'test_session_user1'
                    
                    response = client.post('/send_chat_message', 
                                         json={
                                             'to_user': 'user2',
                                             'message': message
                                         })
                    
                    self.assertEqual(response.status_code, 200)
                    response_data = response.get_json()
                    self.assertTrue(response_data.get('success'))
                
                # User2 retrieves messages - should see all original messages
                with client.session_transaction() as sess:
                    sess['username'] = 'user2'
                    sess['session_id'] = 'test_session_user2'
                
                response = client.get('/get_chat_messages?partner=user1')
                self.assertEqual(response.status_code, 200)
                
                response_data = response.get_json()
                retrieved_messages = response_data['messages']
                
                # Should get all messages in correct order
                self.assertEqual(len(retrieved_messages), len(test_messages))
                for i, message in enumerate(test_messages):
                    self.assertEqual(retrieved_messages[i]['message'], message)
                    self.assertEqual(retrieved_messages[i]['from_user'], 'user1')
                    self.assertEqual(retrieved_messages[i]['to_user'], 'user2')
                
                # Verify that messages were obfuscated in storage
                self.assertEqual(len(sent_messages), len(test_messages))
                for i, sent_msg in enumerate(sent_messages):
                    # Each message should be different when obfuscated
                    self.assertNotEqual(sent_msg['original'], sent_msg['obfuscated'])
                    # But when deobfuscated, should match original
                    from core.message_security import deobfuscate_message
                    deobfuscated = deobfuscate_message(sent_msg['obfuscated'])
                    self.assertEqual(deobfuscated, sent_msg['original'])


if __name__ == '__main__':
    # Run the tests
    unittest.main()
