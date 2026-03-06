import feedparser, re
from datetime import datetime

WHO_RSS_URL = 'https://www.who.int/rss-feeds/news-releases.xml'

# Disease keywords that trigger a flag for Indian children
DISEASE_KEYWORDS = [
    'measles','polio','diphtheria','pertussis','whooping cough',
    'tetanus','hepatitis','meningitis','rubella','mumps',
    'yellow fever','cholera','typhoid','rotavirus',
]
INDIA_KEYWORDS = ['india','maharashtra','pune','mumbai','delhi','gujarat']

_cache = {'flag': False, 'diseases': [], 'fetched_at': None}

def fetch_who_flag() -> dict:
    """Parse WHO RSS and return outbreak flag + matching disease names."""
    try:
        feed    = feedparser.parse(WHO_RSS_URL)
        matched = []
        for entry in feed.entries[:30]:   # check latest 30 items
            text = (entry.get('title','') + ' ' + entry.get('summary','')).lower()
            is_india   = any(k in text for k in INDIA_KEYWORDS)
            disease_hit= [d for d in DISEASE_KEYWORDS if d in text]
            if is_india and disease_hit:
                matched.extend(disease_hit)
        _cache['flag']       = len(matched) > 0
        _cache['diseases']   = list(set(matched))
        _cache['fetched_at'] = datetime.utcnow().isoformat()
    except Exception as e:
        print(f'WHO RSS error: {e} — using cached flag')
    return _cache

def get_who_flag() -> int:
    """Return 0 or 1 for use as XGBoost feature."""
    return int(_cache['flag'])
