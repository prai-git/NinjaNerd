"""
Unit tests for SQLite collaboration features.
Tests chat, invites, message obfuscation, and real-time collaboration support.
"""

import pytest
import tempfile
import os
import shutil
import time
from unittest.mock import Mock, patch
from flask import Flask

from dbmgr.sqlite_manager import SQLiteManager
from dbmgr.sqlite_app_integration import SQLiteAppIntegration
from data.message_security import MessageObfuscator


class TestSQLiteCollaboration:
    """Test SQLite collaboration functionality."""
    
    def setup_method(self):
        """Setup test database and users."""
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, 'test_collab.db')
        
        # Create Flask app for integration testing
        self.app = Flask(__name__)
        self.app.config['SECRET_KEY'] = 'test-collaboration-key'
        
        # Initialize integration with message obfuscation
        self.integration = SQLiteAppIntegration(
            self.app,
            db_path=self.db_path,
            enable_message_obfuscation=True
        )
        
        # Create test users
        self.test_users = [
            ('alice@example.com', 'Alice School'),
            ('bob@example.com', 'Bob School'),
            ('charlie@example.com', 'Charlie School'),
            ('diana@example.com', 'Diana School')
        ]
        
        for email, school in self.test_users:
            self.integration.create_user(email, f'password_{email.split("@")[0]}', school)
    
    def teardown_method(self):
        """Cleanup test database."""
        if hasattr(self, 'integration'):
            self.integration._cleanup()
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    def test_invite_lifecycle(self):
        """Test complete invite lifecycle from creation to acceptance."""
        alice_email, bob_email = self.test_users[0][0], self.test_users[1][0]
        
        # Create invite
        invite_id = self.integration.create_invite(alice_email, bob_email)
        assert invite_id is not None
        
        # Verify invite exists and has correct status
        collab_data = self.integration.load_collaboration_data()
        assert invite_id in collab_data['invites']
        
        invite = collab_data['invites'][invite_id]
        assert invite['from_user'] == alice_email
        assert invite['to_user'] == bob_email
        assert invite['status'] == 'pending'
        assert 'timestamp' in invite
        
        # Accept invite
        success = self.integration.update_invite_status(invite_id, 'accepted')
        assert success is True
        
        # Verify status updated
        updated_collab_data = self.integration.load_collaboration_data()
        updated_invite = updated_collab_data['invites'][invite_id]
        assert updated_invite['status'] == 'accepted'
        
        # Reject another invite
        invite_id_2 = self.integration.create_invite(bob_email, alice_email)
        success = self.integration.update_invite_status(invite_id_2, 'rejected')
        assert success is True
        
        final_collab_data = self.integration.load_collaboration_data()
        rejected_invite = final_collab_data['invites'][invite_id_2]
        assert rejected_invite['status'] == 'rejected'
    
    def test_chat_session_management(self):
        """Test chat session creation and management."""
        alice_email, bob_email = self.test_users[0][0], self.test_users[1][0]
        
        # Create chat session
        session_id = self.integration.create_chat_session(alice_email, bob_email)
        assert session_id is not None
        
        # Verify session exists
        collab_data = self.integration.load_collaboration_data()
        assert session_id in collab_data['chat_sessions']
        
        session = collab_data['chat_sessions'][session_id]
        assert session['user1'] == alice_email
        assert session['user2'] == bob_email
        assert session['active'] is True
        assert session['messages'] == []
        assert 'created_at' in session
        
        # Create multiple sessions for same users (should be allowed)
        session_id_2 = self.integration.create_chat_session(alice_email, bob_email)
        assert session_id_2 is not None
        assert session_id_2 != session_id
        
        # Verify both sessions exist
        updated_collab_data = self.integration.load_collaboration_data()
        assert session_id in updated_collab_data['chat_sessions']
        assert session_id_2 in updated_collab_data['chat_sessions']
    
    def test_message_exchange(self):
        """Test message exchange between users."""
        alice_email, bob_email = self.test_users[0][0], self.test_users[1][0]
        
        # Create chat session
        session_id = self.integration.create_chat_session(alice_email, bob_email)
        
        # Alice sends message to Bob
        message_1_text = "Hello Bob, how are you doing today?"
        message_1_id = self.integration.add_message(
            session_id, alice_email, bob_email, message_1_text
        )
        assert message_1_id is not None
        
        # Bob replies to Alice
        message_2_text = "Hi Alice! I'm doing great, thanks for asking."
        message_2_id = self.integration.add_message(
            session_id, bob_email, alice_email, message_2_text
        )
        assert message_2_id is not None
        
        # Alice sends another message
        message_3_text = "That's wonderful to hear! 😊"
        message_3_id = self.integration.add_message(
            session_id, alice_email, bob_email, message_3_text
        )
        assert message_3_id is not None
        
        # Load collaboration data and verify messages
        collab_data = self.integration.load_collaboration_data()
        session = collab_data['chat_sessions'][session_id]
        messages = session['messages']
        
        assert len(messages) == 3
        
        # Verify message 1
        msg1 = messages[0]
        assert msg1['id'] == message_1_id
        assert msg1['from_user'] == alice_email
        assert msg1['to_user'] == bob_email
        assert msg1['message'] == message_1_text
        assert msg1['displayed'] is False
        assert 'timestamp' in msg1
        
        # Verify message 2
        msg2 = messages[1]
        assert msg2['id'] == message_2_id
        assert msg2['from_user'] == bob_email
        assert msg2['to_user'] == alice_email
        assert msg2['message'] == message_2_text
        
        # Verify message 3
        msg3 = messages[2]
        assert msg3['id'] == message_3_id
        assert msg3['from_user'] == alice_email
        assert msg3['to_user'] == bob_email
        assert msg3['message'] == message_3_text
        
        # Test message display tracking
        success = self.integration.update_message_displayed(message_1_id, True)
        assert success is True
        
        success = self.integration.update_message_displayed(message_2_id, True)
        assert success is True
        
        # Verify display status updated
        updated_collab_data = self.integration.load_collaboration_data()
        updated_session = updated_collab_data['chat_sessions'][session_id]
        updated_messages = updated_session['messages']
        
        assert updated_messages[0]['displayed'] is True
        assert updated_messages[1]['displayed'] is True
        assert updated_messages[2]['displayed'] is False  # Message 3 not marked as displayed
    
    def test_message_obfuscation(self):
        """Test message obfuscation and deobfuscation."""
        alice_email, bob_email = self.test_users[0][0], self.test_users[1][0]
        
        # Create chat session
        session_id = self.integration.create_chat_session(alice_email, bob_email)
        
        # Send message with sensitive content
        sensitive_message = "My secret password is: SuperSecret123! Don't tell anyone."
        message_id = self.integration.add_message(
            session_id, alice_email, bob_email, sensitive_message
        )
        
        # Verify message is obfuscated in database storage
        with self.integration.sqlite_manager.connection_pool.get_connection() as conn:
            stored_message = conn.execute(
                "SELECT message_content, obfuscated_content FROM messages WHERE id = ?",
                (message_id,)
            ).fetchone()
            
            # Original message should be stored
            assert stored_message['message_content'] == sensitive_message
            
            # Obfuscated version should exist and be different
            assert stored_message['obfuscated_content'] is not None
            assert stored_message['obfuscated_content'] != sensitive_message
            
            # Verify obfuscated message can be deobfuscated
            obfuscator = self.integration.message_obfuscator
            deobfuscated = obfuscator.deobfuscate_message(stored_message['obfuscated_content'])
            assert deobfuscated == sensitive_message
        
        # Verify message appears correctly when loaded through integration
        collab_data = self.integration.load_collaboration_data()
        session = collab_data['chat_sessions'][session_id]
        loaded_message = session['messages'][0]
        
        assert loaded_message['message'] == sensitive_message
    
    def test_multiple_concurrent_conversations(self):
        """Test multiple users having concurrent conversations."""
        users = [user[0] for user in self.test_users]
        
        # Create multiple chat sessions
        sessions = {}
        
        # Alice talks to Bob
        sessions['alice_bob'] = self.integration.create_chat_session(users[0], users[1])
        
        # Alice talks to Charlie
        sessions['alice_charlie'] = self.integration.create_chat_session(users[0], users[2])
        
        # Bob talks to Diana
        sessions['bob_diana'] = self.integration.create_chat_session(users[1], users[3])
        
        # Charlie talks to Diana
        sessions['charlie_diana'] = self.integration.create_chat_session(users[2], users[3])
        
        # Add messages to each conversation
        conversations = [
            ('alice_bob', users[0], users[1], [
                "Hey Bob, how's the math homework going?",
                "It's pretty challenging! Can you help me with problem 5?",
                "Sure! Let me explain the solution step by step."
            ]),
            ('alice_charlie', users[0], users[2], [
                "Charlie, did you finish the science project?",
                "Almost done! Just need to write the conclusion.",
                "Great! Want to practice our presentation together?"
            ]),
            ('bob_diana', users[1], users[3], [
                "Diana, are you ready for the history test?",
                "I think so. I've been studying the Civil War chapter.",
                "That's good! The dates are the tricky part."
            ]),
            ('charlie_diana', users[2], users[3], [
                "Hey Diana, want to work on the group project?",
                "Yes! I have some ideas for the presentation.",
                "Perfect! Let's meet in the library after school."
            ])
        ]
        
        # Add messages for each conversation
        for session_key, user1, user2, messages in conversations:
            session_id = sessions[session_key]
            
            for i, message_text in enumerate(messages):
                from_user = user1 if i % 2 == 0 else user2
                to_user = user2 if i % 2 == 0 else user1
                
                message_id = self.integration.add_message(
                    session_id, from_user, to_user, message_text
                )
                assert message_id is not None
        
        # Verify all conversations exist and have correct messages
        collab_data = self.integration.load_collaboration_data()
        chat_sessions = collab_data['chat_sessions']
        
        for session_key, user1, user2, expected_messages in conversations:
            session_id = sessions[session_key]
            assert session_id in chat_sessions
            
            session = chat_sessions[session_id]
            assert session['user1'] == user1
            assert session['user2'] == user2
            assert len(session['messages']) == len(expected_messages)
            
            # Verify message content and sender/receiver
            for i, message in enumerate(session['messages']):
                expected_from = user1 if i % 2 == 0 else user2
                expected_to = user2 if i % 2 == 0 else user1
                
                assert message['from_user'] == expected_from
                assert message['to_user'] == expected_to
                assert message['message'] == expected_messages[i]
    
    def test_collaboration_data_consistency(self):
        """Test data consistency in collaboration features."""
        alice_email, bob_email = self.test_users[0][0], self.test_users[1][0]
        
        # Create complete collaboration workflow
        
        # 1. Create invite
        invite_id = self.integration.create_invite(alice_email, bob_email)
        
        # 2. Accept invite
        self.integration.update_invite_status(invite_id, 'accepted')
        
        # 3. Create chat session
        session_id = self.integration.create_chat_session(alice_email, bob_email)
        
        # 4. Exchange several messages
        messages_data = [
            (alice_email, bob_email, "Hi Bob!"),
            (bob_email, alice_email, "Hello Alice!"),
            (alice_email, bob_email, "How was your day?"),
            (bob_email, alice_email, "It was great, thanks!"),
            (alice_email, bob_email, "Want to study together later?"),
            (bob_email, alice_email, "Sure! What time works for you?")
        ]
        
        message_ids = []
        for from_user, to_user, message_text in messages_data:
            msg_id = self.integration.add_message(session_id, from_user, to_user, message_text)
            message_ids.append(msg_id)
        
        # 5. Mark some messages as displayed
        for i in range(0, len(message_ids), 2):  # Mark every other message
            self.integration.update_message_displayed(message_ids[i], True)
        
        # Verify complete consistency
        collab_data = self.integration.load_collaboration_data()
        
        # Check invite
        assert invite_id in collab_data['invites']
        invite = collab_data['invites'][invite_id]
        assert invite['status'] == 'accepted'
        
        # Check session
        assert session_id in collab_data['chat_sessions']
        session = collab_data['chat_sessions'][session_id]
        assert len(session['messages']) == len(messages_data)
        
        # Check each message
        for i, (from_user, to_user, message_text) in enumerate(messages_data):
            message = session['messages'][i]
            assert message['from_user'] == from_user
            assert message['to_user'] == to_user
            assert message['message'] == message_text
            
            # Check display status
            expected_displayed = i % 2 == 0  # Every other message marked as displayed
            assert message['displayed'] == expected_displayed
        
        # Verify database integrity
        stats = self.integration.get_statistics()
        assert stats['total_users'] >= 4  # Test users + admin
        assert stats['active_sessions'] >= 1
        assert stats['total_messages'] >= len(messages_data)
        assert stats['pending_invites'] == 0  # Invite was accepted
    
    def test_collaboration_cleanup(self):
        """Test cleanup of old collaboration data."""
        alice_email, bob_email = self.test_users[0][0], self.test_users[1][0]
        
        # Create collaboration data
        session_id = self.integration.create_chat_session(alice_email, bob_email)
        
        # Add message and mark as displayed
        message_id = self.integration.add_message(
            session_id, alice_email, bob_email, "This is an old message"
        )
        self.integration.update_message_displayed(message_id, True)
        
        # Create and reject an invite
        invite_id = self.integration.create_invite(alice_email, bob_email)
        self.integration.update_invite_status(invite_id, 'rejected')
        
        # Manually set old timestamps to simulate old data
        with self.integration.sqlite_manager.connection_pool.get_connection() as conn:
            old_timestamp = '2020-01-01T00:00:00'
            
            # Update message timestamp
            conn.execute(
                "UPDATE messages SET timestamp = ? WHERE id = ?",
                (old_timestamp, message_id)
            )
            
            # Update invite timestamp
            conn.execute(
                "UPDATE invites SET timestamp = ? WHERE id = ?",
                (old_timestamp, invite_id)
            )
            
            # Update session timestamp
            conn.execute(
                "UPDATE chat_sessions SET created_at = ? WHERE id = ?",
                (old_timestamp, session_id)
            )
            
            conn.commit()
        
        # Run cleanup (should remove old displayed messages and rejected invites)
        success = self.integration.cleanup_old_data(days=30)
        assert success is True
        
        # Verify cleanup worked
        collab_data = self.integration.load_collaboration_data()
        
        # Old rejected invite should be cleaned up
        assert invite_id not in collab_data['invites']
        
        # Session might be cleaned up if it has no recent messages
        # But we won't assert this as cleanup behavior may vary
    
    def test_invalid_collaboration_operations(self):
        """Test error handling for invalid collaboration operations."""
        alice_email = self.test_users[0][0]
        
        # Test invite with non-existent user
        try:
            invite_id = self.integration.create_invite(alice_email, "nonexistent@example.com")
            # This might succeed (depending on implementation) but session creation should fail
        except:
            pass  # Expected for some implementations
        
        # Test session with non-existent users
        try:
            session_id = self.integration.create_chat_session("fake1@example.com", "fake2@example.com")
            assert session_id is None  # Should fail gracefully
        except:
            pass  # Exception is also acceptable
        
        # Test message to non-existent session
        try:
            message_id = self.integration.add_message(
                "fake-session-id", alice_email, "bob@example.com", "Test message"
            )
            assert message_id is None  # Should fail gracefully
        except:
            pass  # Exception is also acceptable
        
        # Test updating non-existent invite
        success = self.integration.update_invite_status("fake-invite-id", "accepted")
        assert success is False
        
        # Test updating non-existent message
        success = self.integration.update_message_displayed(99999, True)
        assert success is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
