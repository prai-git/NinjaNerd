# NinjaNerd 🥷📚

An interactive educational platform 🔧 

## Technical Features

- Responsive web interface
- RESTful API endpoints
- **Asynchronous Email System**: High-performance email delivery with thread pool management for non-blocking operations
- **Production Logging System**: 5-module logging architecture with structured logging, performance monitoring, and Flask integration
- **Rate Limiting**: Intelligent request throttling with session-based and IP-based limits for API protection
- **Persistence Storage**: Redis-backed session storage with filesystem fallback for high-performance user sessions
- Enterprise-grade database management with DBManager
- JSON-based data storage with integrity protection
- Environment variable configuration designed to help students learn and practice various subjects through AI-powered questions and exercises.

## Features

### 🎯 Multi-Subject Learning
- **Mathematics**: Arithmetic, problem-solving, and mathematical concepts
- **Science**: Basic scientific principles and facts
- **English**: Grammar, vocabulary, and language skills
- **History**: Historical events and figures
- **Geography**: World knowledge and locations
- **Puzzles**: Logic puzzles and brain teasers
- **Stories**: Reading comprehension exercises

### 🎮 Interactive Games
- **AMCA Thrust**: An engaging browser-based fighter plane game where you pilot a blue plane and battle enemy aircraft
- **Tank Attack**: Control a blue tank and defend against enemy red tanks! Collect power boosts to unleash devastating fireballs
- Game library with detailed game descriptions and previews
- Interactive gaming experiences to make learning fun and engaging

### 🤖 AI-Powered Question Generation
- Integration with DeepSeek R1 LLM for dynamic question creation
- Adaptive difficulty based on user performance history
- Personalized learning experience
- Fallback mock questions when API is unavailable

### � Email System
- **Asynchronous Email Delivery**: Non-blocking email operations with thread pool management
- **Account Notifications**: Welcome emails for new user registrations
- **Account Updates**: Email notifications for profile changes
- **Contact System**: Contact form with email delivery to administrators
- **Performance Optimized**: Email operations return immediately without blocking user interactions
- **Backward Compatibility**: Maintains synchronous email methods for existing functionality

### �👤 User Management
- Secure user registration and authentication
- Password hashing for security
- Session management with Flask-Session
- User progress tracking and statistics

### 📊 Progress Tracking
- Question attempt statistics
- Topics covered tracking
- User history and performance analytics
- Last login tracking

### �️ Database Management
- **Enterprise DBManager**: Production-ready database operations with thread-safe access
- **Concurrent User Support**: Handles 1000+ simultaneous users with queue-based operations
- **File Integrity Protection**: Automatic backups, checksum validation, and atomic operations
- **Session Management**: Advanced session tracking with cleanup and validation
- **Error Recovery**: Automatic restore from backup if corruption detected

### 🤝 Collaboration Features
- **User Invitations**: Send and manage collaboration invites between users
- **Chat Sessions**: Real-time messaging for collaborative learning
- **Shared Learning**: Students can study together and share progress

### �🔧 Technical Features
- Responsive web interface
- RESTful API endpoints
- Comprehensive logging with rotating file handlers
- Enterprise-grade database management with DBManager
- JSON-based data storage with integrity protection
- Environment variable configuration

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd NinjaNerd
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   PR_LLM_ENDPOINT=your_deepseek_api_endpoint
   PR_LLM_API_KEY=your_deepseek_api_key
   PR_NIBODH_LOGO=/static/images/logo.png
   ```

4. **Run the application**
   ```bash
   python app.py
   ```

The application will be available at `http://localhost:5001`

## Project Structure

```
NinjaNerd/
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── gw/                    # Gateway services
│   ├── __init__.py        # Package initialization
│   └── emailgw.py         # Email gateway with async support
├── ai/                    # AI/LLM service modules
│   ├── __init__.py        # Package initialization
│   └── llm_service.py     # LLM integration service
├── dbmgr/                 # Database Manager package
│   ├── __init__.py        # Package initialization
│   ├── db_manager.py      # Main database manager
│   ├── file_operations.py # File I/O operations
│   ├── queue_manager.py   # Operation queuing
│   ├── session_manager.py # Session management
│   ├── exceptions.py      # Custom exceptions
│   └── app_integration.py # App integration wrapper
├── logging_system/        # Production logging system
│   ├── __init__.py        # Package initialization
│   ├── log_config.py      # Logging configuration
│   ├── log_manager.py     # Central log management
│   ├── performance_logger.py # Performance metrics logging
│   ├── structured_logger.py  # Structured logging with JSON support
│   └── flask_integration.py  # Flask logging integration
├── session_storage/       # Session persistence system
│   ├── __init__.py        # Package initialization
│   ├── config.py          # Session configuration
│   ├── redis_manager.py   # Redis session management
│   ├── filesystem_fallback.py # Filesystem backup storage
│   ├── encryption.py      # Session encryption utilities
│   └── health_checker.py  # Session storage health monitoring
├── data/                  # Data files
│   ├── Credentials.json   # User credentials and statistics
│   ├── Collaboration.json # Collaboration and chat data
│   ├── english.txt        # English topic prompts
│   ├── geography.txt      # Geography topic prompts
│   ├── history.txt        # History topic prompts
│   ├── math.txt          # Mathematics topic prompts
│   ├── puzzles.txt       # Puzzle topic prompts
│   ├── science.txt       # Science topic prompts
│   └── stories.txt       # Story topic prompts
├── backups/              # Automatic database backups
├── templates/            # HTML templates
│   ├── base.html         # Base template
│   ├── login.html        # Login page
│   ├── create_account.html # Registration page
│   ├── about.html        # About/dashboard page
│   ├── topics.html       # Topic selection
│   ├── exercise.html     # Exercise interface
│   └── games/            # Game templates
│       ├── games_list.html # Games listing page
│       └── game_detail.html # Individual game page
├── static/               # Static assets
│   ├── css/style.css     # Stylesheets
│   ├── js/script.js      # JavaScript
│   ├── images/logo.png   # Application logo
│   └── games/            # Game assets
│       ├── tejas_thrust/ # AMCA Thrust game files
│       │   ├── css/      # Game-specific stylesheets
│       │   └── js/       # Game JavaScript files
│       └── tank_attack/  # Tank Attack game files
│           ├── css/
│           │   └── style.css     # Tank Attack styles
│           ├── js/
│           │   ├── config.js     # Game configuration
│           │   ├── bluedot.js    # Player tank class
│           │   ├── tank.js       # Enemy tank class
│           │   ├── powerboost.js # Power boost collectibles
│           │   └── game.js       # Main game engine
│           └── assets/
│               └── KKing_Remix.wav # Background music
├── test/                 # Unit tests
│   ├── test_dbmanager.py # DBManager tests
│   ├── test_dbmanager_components.py # Component tests
│   ├── test_app_integration.py # Integration tests
│   ├── test_session_management.py # Session tests
│   ├── test_subtopics.py # Subtopic tests
│   ├── test_ds_llm.py    # DeepSeek LLM tests
│   ├── test_oai_llm.py   # OpenAI LLM tests
│   ├── test_emailgw.py   # Email gateway tests
│   ├── test_contact_us.py # Contact form tests
│   ├── test_account.py   # Account functionality tests
│   ├── test_statistics.py # Statistics page tests
│   └── test_async_performance.py # Async email performance tests
├── flask_session/        # Session storage
└── logs/                 # Application logs
    ├── ninjnerd.log          # Main application log
    ├── ninjnerd_errors.log   # Error and exception log
    ├── ninjnerd_access.log   # HTTP request/response log
    └── ninjnerd_performance.log # Performance metrics log
```

## Usage

1. **Account Creation**: Register a new account or use the default admin account

2. **Login**: Access the platform with your credentials

3. **Select Topics**: Choose from available subjects and grade levels

4. **Practice**: Answer AI-generated questions with instant feedback

5. **Track Progress**: Monitor your learning statistics and history

## API Endpoints

- `GET /` - Redirect to login
- `GET /login` - Login page
- `POST /login` - Authenticate user
- `GET /create_account` - Registration page
- `POST /create_account` - Create new account
- `GET /about` - Dashboard/about page
- `GET /account` - User account management page
- `POST /account` - Update user account information
- `GET /statistics` - User statistics and progress page
- `GET /contact_us` - Contact form page
- `POST /contact_us` - Submit contact form message
- `GET /topics/<grade>` - Topic selection for grade
- `GET /subtopics/<grade>/<topic>` - Subtopic selection for grade and topic
- `GET /exercise/<grade>/<topic>` - Exercise interface
- `GET /exercise/<grade>/<topic>/<subtopic>` - Exercise interface with subtopic focus
- `GET /get_current_question` - Fetch current question
- `POST /submit_answer` - Submit answer for evaluation
- `GET /games/<grade>` - Games listing for grade
- `GET /games/<grade>/<game_slug>` - Individual game page
- `POST /invite_user` - Send collaboration invite
- `POST /respond_invite` - Respond to collaboration invite
- `GET /collaboration` - Collaboration dashboard
- `POST /send_message` - Send chat message
- `GET /logout` - Logout user
- `GET /check_session` - Validate session

## Dependencies

- **Flask 2.3.3**: Web framework
- **Flask-Session 0.5.0**: Session management
- **Requests 2.31.0**: HTTP library for API calls
- **Werkzeug 2.3.7**: Password hashing utilities
- **Python-dotenv 1.0.0**: Environment variable management

## Testing

The application includes comprehensive unit tests:

```bash
# Run all tests
python3 test/test_dbmanager.py                 # DBManager unit tests (23 tests)
python3 test/test_dbmanager_components.py      # Component tests (22 tests)
python3 test/test_dbmanager_integration.py     # Integration tests (10 tests)
python3 test/test_app_integration.py           # App integration tests
python3 test/test_session_management.py        # Session management tests
python3 test/test_subtopics.py                 # Subtopic functionality tests
python3 test/test_ds_llm.py                    # DeepSeek LLM API tests (6 tests)
python3 test/test_oai_llm.py                   # OpenAI LLM API tests (7 tests)

# Email system tests (require environment variables)
export <id> && export <key>
python3 test/test_emailgw.py                   # Email gateway tests (8 tests)
python3 test/test_contact_us.py                # Contact form tests (6 tests)
python3 test/test_account.py                   # Account page tests (4 tests)
python3 test/test_statistics.py               # Statistics page tests (4 tests)
python3 test/test_async_performance.py         # Async email performance tests (1 test)
```

All tests are designed to be safe and do not modify production database files.

## Configuration

The application uses environment variables for configuration:
- `PR_LLM_ENDPOINT`: DeepSeek API endpoint
- `PR_LLM_API_KEY`: DeepSeek API key
- `PR_NIBODH_LOGO`: Logo path

## Logging

**Production-Grade Logging System** with 5 specialized modules:

### Log Files:
- **`ninjnerd.log`**: Main application flow and component initialization
- **`ninjnerd_errors.log`**: Errors, exceptions, and critical issues with full stack traces
- **`ninjnerd_access.log`**: HTTP request/response logging with timing and user data
- **`ninjnerd_performance.log`**: Performance metrics, slow operations, and system health

### Features:
- **Structured Logging**: JSON-formatted logs with consistent metadata
- **Performance Monitoring**: Background thread tracking operation timing and bottlenecks
- **Flask Integration**: Automatic request/response logging with user context
- **Rotating File Handlers**: 10MB files with 5 backup retention
- **Critical Alerts**: Automatic critical-level logging when LLM API fails and mock questions are used
- **Thread-Safe**: Concurrent logging from multiple application components
- **Email Operations**: Async email performance tracking and error logging

### Log Analysis:
```bash
# Check recent errors
tail -50 logs/ninjnerd_errors.log

# Monitor performance issues
grep -E "[0-9]{4,}\.[0-9]+ms" logs/ninjnerd_performance.log

# Check LLM failures and email issues
grep -i "mock.*fallback\|critical\|email.*failed" logs/ninjnerd_errors.log

# Monitor email performance
grep -i "email.*sent\|async.*email" logs/ninjnerd.log

# Real-time monitoring
tail -f logs/ninjnerd.log logs/ninjnerd_errors.log
```

## Rate Limiting

**Intelligent Request Throttling** with multiple protection layers:

### Features:
- **Session-Based Limits**: Per-user rate limiting using session authentication
- **IP-Based Fallback**: Anonymous user protection by IP address
- **Configurable Limits**: Default 1000 requests per hour per user/IP
- **Memory Storage**: Fast in-memory rate limit tracking
- **Graceful Degradation**: Automatic fallback if rate limiter fails
- **HTTP Headers**: Rate limit status included in response headers

### Configuration:
- **Default Limits**: 1000 requests/hour per session or IP
- **Storage**: Memory-based for high performance
- **Error Handling**: 429 status codes with JSON/HTML responses
- **Bypass Options**: Graceful operation if rate limiting fails

### Rate Limit Headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1628097600
```

## Persistence Storage

**Production-Ready Session Management** with Redis and filesystem redundancy:

### Architecture:
- **Primary Storage**: Redis for high-performance session data
- **Filesystem Fallback**: Automatic fallback when Redis unavailable
- **Session Encryption**: AES encryption for sensitive session data
- **Health Monitoring**: Continuous storage system health checks

### Features:
- **Redis Integration**: High-performance session storage with connection pooling
- **Automatic Fallback**: Seamless switch to filesystem when Redis fails
- **Session Security**: Encrypted session data with configurable encryption keys
- **Concurrent Support**: Thread-safe operations supporting 1000+ users
- **Session Cleanup**: Automatic expired session removal
- **Health Metrics**: Real-time monitoring of storage system performance

### Configuration:
```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=XXXX
REDIS_PASSWORD=your_password
REDIS_DB=0

# Session Security
SESSION_ENCRYPTION_KEY=your_encryption_key
ENCRYPT_SESSIONS=true
SESSION_TIMEOUT_MINUTES=X0

# Fallback Configuration
ENABLE_FILESYSTEM_FALLBACK=true
FILESYSTEM_SESSION_DIR=flask_session
```

### Storage Monitoring:
```bash
# Check storage health
grep "health" logs/ninjnerd.log

# Monitor Redis connectivity
grep -i "redis" logs/ninjnerd_errors.log

# Session metrics
grep "session.*metrics" logs/ninjnerd_performance.log
```

## Security Features

- Password hashing using Werkzeug
- Session management with filesystem storage
- Input validation and error handling
- Secure credential storage
- Thread-safe database operations
- Automatic data backup and recovery
- File integrity protection with checksums

## Database Management

The application uses an enterprise-grade DBManager system that provides:

- **Concurrent Access**: Supports 1000+ simultaneous users
- **Data Integrity**: Automatic backups before every write operation
- **Error Recovery**: Automatic restoration from backups if corruption detected
- **Thread Safety**: Queue-based operations prevent data conflicts
- **Session Management**: Advanced session tracking and cleanup
- **Performance Monitoring**: System status and performance metrics

---

**Author**: Praveen Rai