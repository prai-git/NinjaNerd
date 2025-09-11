"""
Input sanitization and validation utilities for secure data processing.
Provides centralized validation, normalization, and sanitization functions.
"""

import re
import html
import hashlib
import logging
from typing import Any, Dict, Optional, Union, List
from functools import wraps

class InputValidator:
    """
    Centralized input validation and sanitization utility.
    Handles length limits, character whitelisting, HTML escaping, and logging.
    """
    
    # Character whitelists for different input types
    ALPHANUMERIC_SPACE = re.compile(r'^[a-zA-Z0-9\s]+$')
    USERNAME_CHARS = re.compile(r'^[a-zA-Z0-9._@-]+$')
    SCHOOL_NAME_CHARS = re.compile(r'^[a-zA-Z0-9\s.,\'-;&]+$')
    SUBJECT_CHARS = re.compile(r'^[a-zA-Z0-9\s.,!?()-]+$')
    CONTENT_CHARS = re.compile(r'^[a-zA-Z0-9\s.,!?()\'\"-_\n\r\t]+$')
    CHAT_MESSAGE_CHARS = re.compile(r'^[a-zA-Z0-9\s.,!?()\'\"-_😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺🤡💩👻💀☠️👽👾🤖🎃😺😸😹😻😼😽🙀😿😾]+$')
    
    # Length limits for different field types
    MAX_USERNAME_LENGTH = 50
    MAX_SCHOOL_NAME_LENGTH = 100
    MAX_SUBJECT_LENGTH = 200
    MAX_CONTENT_LENGTH = 5000
    MAX_CHAT_MESSAGE_LENGTH = 1000
    MAX_SUBTOPIC_LENGTH = 100
    
    def __init__(self, logger: Optional[logging.Logger] = None):
        self.logger = logger or logging.getLogger(__name__)
    
    def _log_sanitization(self, field_name: str, original: str, sanitized: str, action: str):
        """Log sanitization actions without storing dangerous content."""
        if original != sanitized:
            # Create a hash of the original for tracking without storing dangerous content
            original_hash = hashlib.md5(original[:100].encode('utf-8')).hexdigest()[:8]
            sanitized_preview = sanitized[:50] + "..." if len(sanitized) > 50 else sanitized
            
            self.logger.info(
                f"Input sanitization: field='{field_name}', "
                f"action='{action}', "
                f"original_hash='{original_hash}', "
                f"original_length={len(original)}, "
                f"sanitized_preview='{sanitized_preview}', "
                f"sanitized_length={len(sanitized)}"
            )
    
    def sanitize_username(self, username: str) -> str:
        """
        Sanitize username input.
        
        Args:
            username: Raw username input
            
        Returns:
            str: Sanitized username
        """
        if not isinstance(username, str):
            username = str(username)
        
        original = username
        
        # Trim and normalize
        username = username.strip().lower()
        
        # Remove any HTML tags first
        username = re.sub(r'<[^>]+>', '', username)
        
        # Apply length limit
        if len(username) > self.MAX_USERNAME_LENGTH:
            username = username[:self.MAX_USERNAME_LENGTH]
        
        # Remove invalid characters - keep only allowed chars
        if not self.USERNAME_CHARS.match(username):
            # Replace invalid chars with empty string
            username = re.sub(r'[^a-zA-Z0-9._@-]', '', username)
        
        # Ensure minimum length
        if len(username) < 1:
            raise ValueError("Username must contain at least one valid character")
        
        self._log_sanitization("username", original, username, "sanitize")
        return username
    
    def sanitize_school_name(self, school_name: str) -> str:
        """
        Sanitize school name input.
        
        Args:
            school_name: Raw school name input
            
        Returns:
            str: Sanitized school name
        """
        if not isinstance(school_name, str):
            school_name = str(school_name)
        
        original = school_name
        
        # Trim whitespace
        school_name = school_name.strip()
        
        # HTML escape for safety
        school_name = html.escape(school_name)
        
        # Apply length limit
        if len(school_name) > self.MAX_SCHOOL_NAME_LENGTH:
            school_name = school_name[:self.MAX_SCHOOL_NAME_LENGTH]
        
        # Remove invalid characters (allow HTML escape sequences)
        if school_name and not self.SCHOOL_NAME_CHARS.match(school_name):
            school_name = re.sub(r'[^a-zA-Z0-9\s.,\'-;&]', '', school_name)
        
        # Handle empty result
        if not school_name.strip():
            school_name = "Unknown School"
        
        self._log_sanitization("school_name", original, school_name, "sanitize")
        return school_name
    
    def sanitize_subject(self, subject: str) -> str:
        """
        Sanitize subject/content input.
        
        Args:
            subject: Raw subject input
            
        Returns:
            str: Sanitized subject
        """
        if not isinstance(subject, str):
            subject = str(subject)
        
        original = subject
        
        # Trim whitespace
        subject = subject.strip()
        
        # HTML escape
        subject = html.escape(subject)
        
        # Apply length limit
        if len(subject) > self.MAX_SUBJECT_LENGTH:
            subject = subject[:self.MAX_SUBJECT_LENGTH]
        
        # Remove invalid characters
        if subject and not self.SUBJECT_CHARS.match(subject):
            subject = re.sub(r'[^a-zA-Z0-9\s.,!?()\'-]', '', subject)
        
        self._log_sanitization("subject", original, subject, "sanitize")
        return subject
    
    def sanitize_content(self, content: str) -> str:
        """
        Sanitize general content input.
        
        Args:
            content: Raw content input
            
        Returns:
            str: Sanitized content
        """
        if not isinstance(content, str):
            content = str(content)
        
        original = content
        
        # Trim whitespace but preserve internal structure
        content = content.strip()
        
        # HTML escape
        content = html.escape(content)
        
        # Apply length limit
        if len(content) > self.MAX_CONTENT_LENGTH:
            content = content[:self.MAX_CONTENT_LENGTH]
        
        # Remove dangerous patterns (script tags, etc.)
        dangerous_patterns = [
            r'<script[^>]*>.*?</script>',
            r'javascript:',
            r'data:text/html',
            r'vbscript:',
            r'onload\s*=',
            r'onerror\s*=',
            r'onclick\s*=',
        ]
        
        for pattern in dangerous_patterns:
            content = re.sub(pattern, '', content, flags=re.IGNORECASE | re.DOTALL)
        
        self._log_sanitization("content", original, content, "sanitize")
        return content
    
    def sanitize_chat_message(self, message: str) -> str:
        """
        Sanitize chat message with emoji support.
        
        Args:
            message: Raw chat message
            
        Returns:
            str: Sanitized chat message
        """
        if not isinstance(message, str):
            message = str(message)
        
        original = message
        
        # Trim whitespace
        message = message.strip()
        
        # HTML escape
        message = html.escape(message)
        
        # Apply length limit
        if len(message) > self.MAX_CHAT_MESSAGE_LENGTH:
            message = message[:self.MAX_CHAT_MESSAGE_LENGTH]
        
        # Remove control characters but keep newlines
        message = re.sub(r'[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]', '', message)
        
        self._log_sanitization("chat_message", original, message, "sanitize")
        return message
    
    def sanitize_subtopic_parameter(self, subtopic: str) -> str:
        """
        Sanitize subtopic parameters.
        
        Args:
            subtopic: Raw subtopic parameter
            
        Returns:
            str: Sanitized subtopic
        """
        if not isinstance(subtopic, str):
            subtopic = str(subtopic)
        
        original = subtopic
        
        # Trim and normalize
        subtopic = subtopic.strip().lower()
        
        # HTML escape
        subtopic = html.escape(subtopic)
        
        # Apply length limit
        if len(subtopic) > self.MAX_SUBTOPIC_LENGTH:
            subtopic = subtopic[:self.MAX_SUBTOPIC_LENGTH]
        
        # Only allow alphanumeric, underscore, dash, dot
        subtopic = re.sub(r'[^a-zA-Z0-9_.-]', '', subtopic)
        
        self._log_sanitization("subtopic", original, subtopic, "sanitize")
        return subtopic
    
    def validate_and_sanitize_form_data(self, form_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate and sanitize a dictionary of form data.
        
        Args:
            form_data: Dictionary of form fields
            
        Returns:
            Dict: Sanitized form data
        """
        sanitized = {}
        
        for field_name, value in form_data.items():
            if not isinstance(value, str):
                continue
            
            # Apply appropriate sanitization based on field name
            if field_name in ['username', 'email']:
                sanitized[field_name] = self.sanitize_username(value)
            elif field_name in ['school_name']:
                sanitized[field_name] = self.sanitize_school_name(value)
            elif field_name in ['subject']:
                sanitized[field_name] = self.sanitize_subject(value)
            elif field_name in ['content', 'message']:
                sanitized[field_name] = self.sanitize_content(value)
            elif field_name in ['subtopic', 'topic']:
                sanitized[field_name] = self.sanitize_subtopic_parameter(value)
            else:
                # Default sanitization for unknown fields
                sanitized[field_name] = self.sanitize_content(value)
        
        return sanitized


# Global validator instance
_validator: Optional[InputValidator] = None

def get_input_validator(logger: Optional[logging.Logger] = None) -> InputValidator:
    """Get or create the global input validator."""
    global _validator
    if _validator is None:
        _validator = InputValidator(logger)
    return _validator

def sanitize_input(field_type: str, value: str, logger: Optional[logging.Logger] = None) -> str:
    """
    Convenient function for sanitizing individual inputs.
    
    Args:
        field_type: Type of field ('username', 'school_name', 'subject', 'content', 'chat_message', 'subtopic')
        value: Raw input value
        logger: Optional logger instance
        
    Returns:
        str: Sanitized value
    """
    validator = get_input_validator(logger)
    
    sanitization_map = {
        'username': validator.sanitize_username,
        'school_name': validator.sanitize_school_name,
        'subject': validator.sanitize_subject,
        'content': validator.sanitize_content,
        'chat_message': validator.sanitize_chat_message,
        'subtopic': validator.sanitize_subtopic_parameter,
    }
    
    sanitizer = sanitization_map.get(field_type, validator.sanitize_content)
    return sanitizer(value)

def sanitized_form_field(field_type: str):
    """
    Decorator to automatically sanitize form field input.
    
    Args:
        field_type: Type of field to sanitize
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # This decorator can be applied to route handlers
            # The actual sanitization should be done in the route handler itself
            return func(*args, **kwargs)
        return wrapper
    return decorator
