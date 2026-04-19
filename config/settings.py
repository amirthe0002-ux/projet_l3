import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Build paths
BASE_DIR = Path(__file__).resolve().parent.parent

# Secret key
SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-your-secret-key')

# Debug
DEBUG = os.getenv('DEBUG', True) == 'True'

# Allowed hosts
ALLOWED_HOSTS = ['*']
#ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

# ============================================
# INSTALLED APPS
# ============================================
ASGI_APPLICATION = 'config.asgi.application'
INSTALLED_APPS = [
    'daphne',  # WebSocket support
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party
    'rest_framework',
    'corsheaders',

    # Local
    'api',
]

# ============================================
# MIDDLEWARE
# ============================================

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',  # CORS
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
      'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
]
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
# ============================================
# ROOT URLCONF
# ============================================

ROOT_URLCONF = 'config.urls'

# ============================================
# TEMPLATES
# ============================================

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'authorization',
    'content-type',
    'x-requested-with',
    'accept',
    'origin',
    'x-csrftoken',
]
CORS_ALLOW_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']

# ============================================
# DATABASE
# ============================================

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': os.getenv('DB_NAME', 'aaaa'),
        'USER': os.getenv('DB_USER', 'root'),
        'PASSWORD': os.getenv('DB_PASSWORD', ''),
        'HOST': os.getenv('DB_HOST', '127.0.0.1'),
        'PORT': os.getenv('DB_PORT', '3306'),

        'OPTIONS': {
            'charset': 'utf8mb4',
        }
    }
}

# ============================================
# PASSWORD VALIDATION
# ============================================

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# ============================================
# INTERNATIONALIZATION
# ============================================

LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'Africa/Algiers'
USE_I18N = True
USE_TZ = True

# ============================================
# STATIC & MEDIA FILES
# ============================================

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
STATICFILES_DIRS = [
    BASE_DIR / 'static',
]

# ============================================
# DEFAULT PRIMARY KEY
# ============================================

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ============================================
# CORS CONFIGURATION
# ============================================

CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
]

# ============================================
# REST FRAMEWORK CONFIGURATION
# ============================================

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 10,
    'DEFAULT_FILTER_BACKENDS': [
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
}

# ============================================
# JWT CONFIGURATION
# ============================================

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': __import__('datetime').timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': __import__('datetime').timedelta(days=7),
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': os.getenv('JWT_SECRET_KEY', SECRET_KEY),
}

# ============================================
# CUSTOM USER MODEL (OPTIONNEL)
# ============================================
AUTH_USER_MODEL = 'api.Utilisateur'
# Décommenter si vous voulez utiliser un custom user model
# AUTH_USER_MODEL = 'api.Utilisateur'
