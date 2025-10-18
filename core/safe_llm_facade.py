"""
Safe LLM Service facade to handle graceful degradation when LLM service is not initialized.
Provides no-op implementations and structured error responses.
"""

import logging
from typing import Dict, List, Any, Optional

class SafeLLMServiceFacade:
    """
    Facade that provides safe access to LLM service with graceful degradation.
    Returns structured error responses when the real service is unavailable.
    """
    
    def __init__(self, real_service=None, logger: Optional[logging.Logger] = None):
        self.real_service = real_service
        self.logger = logger or logging.getLogger(__name__)
        self._first_use_warning_logged = False
    
    def _log_first_use_warning(self):
        """Log warning on first use if service not initialized."""
        if not self._first_use_warning_logged:
            self.logger.warning(
                "LLM service accessed before initialization. "
                "Consider calling initialize_llm_service() during app startup."
            )
            self._first_use_warning_logged = True
    
    def _get_mock_response(self, error_msg: str = "LLM service not available") -> Dict[str, Any]:
        """Generate a structured mock response for when service is unavailable."""
        return {
            'status': 'error',
            'error': 'service_unavailable',
            'message': error_msg,
            'content': None,
            'fallback': True,
            'questions': [
                {
                    'id': 'mock_1',
                    'question': 'What is 2 + 2?',
                    'options': ['3', '4', '5', '6'],
                    'correct_answer': '4',
                    'explanation': 'Basic addition: 2 + 2 = 4'
                }
            ]
        }
    
    def call_llm_api(self, prompt: str, user_history: List = None, session_id: str = None, username: str = None) -> Dict[str, Any]:
        """
        Safely call LLM API with graceful degradation.
        
        Args:
            prompt: The prompt to send to LLM
            user_history: List of previous interactions
            session_id: Session identifier
            username: User identifier
            
        Returns:
            Dict containing LLM response or mock data if service unavailable
        """
        if self.real_service is None:
            self._log_first_use_warning()
            return self._get_mock_response("LLM service not initialized")
        
        try:
            return self.real_service.call_llm_api(prompt, user_history or [], session_id, username)
        except Exception as e:
            self.logger.error(f"LLM API call failed: {str(e)}")
            return self._get_mock_response(f"LLM API call failed: {str(e)}")
    
    def generate_learning_content(self, topic: str, subtopic_name: str, subtopic_description: str, grade: str, session_id: str = None, username: str = None) -> Dict[str, Any]:
        """
        Safely generate learning content with graceful degradation.
        
        Args:
            topic: Learning topic
            subtopic_name: Name of the specific subtopic
            subtopic_description: Description of the subtopic
            grade: Grade level
            session_id: Session identifier
            username: User identifier
            
        Returns:
            Dict containing learning content or mock data if service unavailable
        """
        if self.real_service is None:
            self._log_first_use_warning()
            return self._get_mock_response("Learning content generation not available")
        
        try:
            return self.real_service.generate_learning_content(topic, subtopic_name, subtopic_description, grade, session_id, username)
        except Exception as e:
            self.logger.error(f"Learning content generation failed: {str(e)}")
            return self._get_mock_response(f"Learning content generation failed: {str(e)}")
    
    def check_answer_with_llm(self, question: str, user_answer: str, explanation: str, session_id: str = None, username: str = None) -> bool:
        """
        Safely check answer with graceful degradation.
        
        Args:
            question: The question text
            user_answer: User's submitted answer
            explanation: Expected explanation
            session_id: Session identifier
            username: User identifier
            
        Returns:
            bool: True for correct (defaults to False if service unavailable)
        """
        if self.real_service is None:
            self._log_first_use_warning()
            self.logger.info(f"Answer check unavailable - defaulting to incorrect for safety")
            return False
        
        try:
            # Handle mocked services (for testing) - they have special attributes
            if hasattr(self.real_service, '_mock_name') or hasattr(self.real_service, 'check_answer_with_llm'):
                return self.real_service.check_answer_with_llm(question, user_answer, explanation, session_id, username)
            else:
                return self.real_service.check_answer_with_llm(question, user_answer, explanation, session_id, username)
        except Exception as e:
            self.logger.error(f"Answer checking failed: {str(e)}")
            # Default to False for safety when unable to verify
            return False
    
    def cleanup_session_queue_requests(self, session_id: str) -> None:
        """
        Safely cleanup session queue requests.
        
        Args:
            session_id: Session identifier to cleanup
        """
        if self.real_service is None:
            self._log_first_use_warning()
            return  # No-op if service not available
        
        try:
            self.real_service.cleanup_session_queue_requests(session_id)
        except Exception as e:
            self.logger.error(f"Session cleanup failed: {str(e)}")
    
    def set_active_sessions_reference(self, active_sessions: Dict) -> None:
        """
        Safely set active sessions reference.
        
        Args:
            active_sessions: Reference to active sessions dictionary
        """
        if self.real_service is None:
            self._log_first_use_warning()
            return  # No-op if service not available
        
        try:
            self.real_service.set_active_sessions_reference(active_sessions)
        except Exception as e:
            self.logger.error(f"Setting active sessions reference failed: {str(e)}")
    
    def is_available(self) -> bool:
        """Check if the real LLM service is available."""
        return self.real_service is not None
    
    def initialize_service(self, real_service, logger: Optional[logging.Logger] = None):
        """
        Initialize with a real LLM service instance.
        
        Args:
            real_service: The actual LLM service instance
            logger: Optional logger instance
        """
        self.real_service = real_service
        if logger:
            self.logger = logger
        self.logger.info("LLM service facade initialized with real service")


# Global safe LLM service instance
_safe_llm_service: Optional[SafeLLMServiceFacade] = None

def get_safe_llm_service(logger: Optional[logging.Logger] = None) -> SafeLLMServiceFacade:
    """Get or create the global safe LLM service facade."""
    global _safe_llm_service
    if _safe_llm_service is None:
        _safe_llm_service = SafeLLMServiceFacade(logger=logger)
    return _safe_llm_service

def initialize_safe_llm_service(real_service=None, logger: Optional[logging.Logger] = None) -> SafeLLMServiceFacade:
    """Initialize the global safe LLM service facade with a real service."""
    global _safe_llm_service
    _safe_llm_service = SafeLLMServiceFacade(real_service, logger)
    return _safe_llm_service
