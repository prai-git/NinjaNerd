# NinjaNerd 🥷📚

An interactive educational platform designed to help students learn and practice various subjects through AI-powered questions and exercises.

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
- **Tejas Thrust**: An engaging browser-based game that combines entertainment with learning
- Game library with detailed game descriptions and previews
- Interactive gaming experiences to make learning fun and engaging

### 🤖 AI-Powered Question Generation
- Integration with DeepSeek R1 LLM for dynamic question creation
- Adaptive difficulty based on user performance history
- Personalized learning experience
- Fallback mock questions when API is unavailable

### 👤 User Management
- Secure user registration and authentication
- Password hashing for security
- Session management with Flask-Session
- User progress tracking and statistics

### 📊 Progress Tracking
- Question attempt statistics
- Topics covered tracking
- User history and performance analytics
- Last login tracking

### 🔧 Technical Features
- Responsive web interface
- RESTful API endpoints
- Comprehensive logging with rotating file handlers
- JSON-based data storage
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
├── data/                  # Data files
│   ├── Credentials.json   # User credentials and statistics
│   ├── english.txt        # English topic prompts
│   ├── geography.txt      # Geography topic prompts
│   ├── history.txt        # History topic prompts
│   ├── math.txt          # Mathematics topic prompts
│   ├── puzzles.txt       # Puzzle topic prompts
│   ├── science.txt       # Science topic prompts
│   └── stories.txt       # Story topic prompts
├── templates/            # HTML templates
│   ├── base.html         # Base template
│   ├── login.html        # Login page
│   ├── create_account.html # Registration page
│   ├── about.html        # About/dashboard page
│   ├── topics.html       # Topic selection
│   └── exercise.html     # Exercise interface
├── static/               # Static assets
│   ├── css/style.css     # Stylesheets
│   ├── js/script.js      # JavaScript
│   └── images/logo.png   # Application logo
├── flask_session/        # Session storage
└── logs/                 # Application logs
```

## Usage

1. **Account Creation**: Register a new account or use the default admin account
   - Default: `admin@gmail.com` / `adminatgmaildotcom`

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
- `GET /topics/<grade>` - Topic selection for grade
- `GET /exercise/<grade>/<topic>` - Exercise interface
- `GET /get_current_question` - Fetch current question
- `POST /submit_answer` - Submit answer for evaluation
- `GET /logout` - Logout user
- `GET /check_session` - Validate session

## Dependencies

- **Flask 2.3.3**: Web framework
- **Flask-Session 0.5.0**: Session management
- **Requests 2.31.0**: HTTP library for API calls
- **Werkzeug 2.3.7**: Password hashing utilities
- **Python-dotenv 1.0.0**: Environment variable management

## Configuration

The application uses environment variables for configuration:
- `PR_LLM_ENDPOINT`: DeepSeek API endpoint
- `PR_LLM_API_KEY`: DeepSeek API key
- `PR_NIBODH_LOGO`: Logo path

## Logging

- Comprehensive logging with rotating file handlers
- Logs stored in `logs/ninja_nerd.log`
- Maximum file size: 10MB with 5 backup files
- User activity tracking and error logging

## Security Features

- Password hashing using Werkzeug
- Session management with filesystem storage
- Input validation and error handling
- Secure credential storage

---

**Author**: Praveen Rai