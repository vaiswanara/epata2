/**
 * e-PATA - Mobile-First Vedic Astrology Learning Platform
 * Optimized for smartphones with touch gestures and PWA support
 */

// ============================================
// GLOBAL STATE
// ============================================
const AppState = {
    lessons: [],
    playlists: [],
    favorites: JSON.parse(localStorage.getItem('epata_favorites') || '[]'),
    completed: JSON.parse(localStorage.getItem('epata_completed') || '[]'),
    recentlyWatched: JSON.parse(localStorage.getItem('epata_recent') || '[]'),
    currentView: 'dashboard',
    currentVideo: null,
    searchQuery: '',
    filters: { playlist: '', language: '' },
    displayCount: 12,
    isOnline: navigator.onLine
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
const Utils = {
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');
        const icon = toast.querySelector('i');
        
        toastMessage.textContent = message;
        icon.className = type === 'success' ? 'fas fa-check-circle' : 
                         type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-info-circle';
        icon.style.color = type === 'success' ? 'var(--success)' : 
                          type === 'error' ? 'var(--danger)' : 'var(--warning)';
        
        toast.classList.add('active');
        setTimeout(() => toast.classList.remove('active'), 2500);
    },

    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    },

    getYouTubeThumbnail(videoId) {
        return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    },

    getLanguage(playlistName) {
        if (playlistName.includes('ಕನ್ನಡ')) return 'kannada';
        if (playlistName.includes('తెలుగు')) return 'telugu';
        return 'other';
    },

    getLanguageDisplay(playlistName) {
        if (playlistName.includes('ಕನ್ನಡ')) return 'ಕನ್ನಡ';
        if (playlistName.includes('తెలుగు')) return 'తెలుగు';
        return 'Other';
    },

    getCategoryIcon(playlistName) {
        const name = playlistName.toLowerCase();
        if (name.includes('jyotisha')) return 'fa-star';
        if (name.includes('mana')) return 'fa-brain';
        if (name.includes('prashna')) return 'fa-question-circle';
        if (name.includes('app')) return 'fa-mobile-alt';
        return 'fa-book';
    },

    getCategoryColor(playlistName) {
        const name = playlistName.toLowerCase();
        if (name.includes('jyotisha')) return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        if (name.includes('mana')) return 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
        if (name.includes('prashna')) return 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';
        if (name.includes('app')) return 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)';
        return 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)';
    },

    formatPlaylistName(name) {
        return name.replace(/[()]/g, '').trim();
    },

    saveToStorage(key, data) {
        localStorage.setItem(`epata_${key}`, JSON.stringify(data));
    },

    // Share functionality
    async shareLesson(lesson) {
        const url = lesson.videoId ? `https://youtube.com/watch?v=${lesson.videoId}` : '';
        const text = `Check out this Vedic Astrology lesson: ${lesson.title}`;
        
        if (navigator.share) {
            try {
                await navigator.share({ title: lesson.title, text, url });
            } catch (err) {
                // User cancelled
            }
        }
    },

    // Copy to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            Utils.showToast('Link copied!');
        } catch (err) {
            // Fallback
            const input = document.createElement('input');
            input.value = text;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            Utils.showToast('Link copied!');
        }
    }
};

// ============================================
// DATA MANAGEMENT
// ============================================
const DataManager = {
    async loadData() {
        const localUrl = 'links.txt';
        const googleSheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ6RStlHwy-jhwrGCg7JUrE8I3MZxukUqBGqdUxGywRof4WyItHEJZ0FP93GeB_ktBAXte3avGhYEVw/pub?gid=0&single=true&output=csv';
        
        // Append timestamp to prevent caching
        const sheetUrlWithCache = googleSheetUrl + '&t=' + new Date().getTime();

        // 1. Check cache and load immediately
        let isCachedLoaded = false;
        const cachedData = localStorage.getItem('epata_cached_lessons');
        
        if (cachedData) {
            try {
                const parsedLessons = JSON.parse(cachedData);
                if (Array.isArray(parsedLessons) && parsedLessons.length > 0) {
                    AppState.lessons = parsedLessons;
                    // Reconstruct playlists from lessons
                    const playlists = new Set(parsedLessons.map(l => l.playlist));
                    AppState.playlists = Array.from(playlists).sort();
                    isCachedLoaded = true;
                    console.log('Loaded lessons from cache');
                }
            } catch (e) {
                console.error('Error parsing cached lessons:', e);
            }
        }

        // 2. Define fetch logic for background update
        const fetchFreshData = async () => {
            try {
                // Fetch both sources in parallel
                const results = await Promise.allSettled([
                    fetch(localUrl).then(res => {
                        if (!res.ok) throw new Error('Failed to load local file');
                        return res.text();
                    }),
                    fetch(sheetUrlWithCache).then(res => {
                        if (!res.ok) throw new Error('Failed to load Google Sheet');
                        return res.text();
                    })
                ]);

                const lessons = [];
                const playlists = new Set();
                let globalIndex = 0;
                
                const processCSV = (text) => {
                    const rows = text.trim().split('\n');
                    // Skip header row
                    rows.slice(1).forEach(row => {
                        const parts = row.split(',').map(f => f.trim());
                        if (parts.length >= 3) {
                            const [playlist, title, videoId, pdfLink] = parts;
                            if (playlist && title) {
                                playlists.add(playlist);
                                lessons.push({
                                    id: `lesson_${globalIndex++}`,
                                    playlist,
                                    title,
                                    videoId: videoId?.length === 11 ? videoId : null,
                                    pdfLink: pdfLink && pdfLink !== 'none' ? pdfLink : null,
                                    language: Utils.getLanguage(playlist),
                                    thumbnail: videoId?.length === 11 ? Utils.getYouTubeThumbnail(videoId) : null,
                                    hasNotes: pdfLink && pdfLink !== 'none'
                                });
                            }
                        }
                    });
                };
                
                // Process results from both sources
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        processCSV(result.value);
                    } else {
                        console.warn(`Source ${index === 0 ? 'Local' : 'Google Sheets'} failed:`, result.reason);
                    }
                });

                if (lessons.length === 0) return false;

                // Check if data differs from current AppState
                const currentDataStr = JSON.stringify(AppState.lessons);
                const newDataStr = JSON.stringify(lessons);

                if (currentDataStr !== newDataStr) {
                    console.log('New data found, updating...');
                    AppState.lessons = lessons;
                    AppState.playlists = Array.from(playlists).sort();
                    
                    // Save to cache
                    localStorage.setItem('epata_cached_lessons', newDataStr);

                    // If we already rendered (cache was loaded), re-render silently
                    if (isCachedLoaded) {
                        UIRenderer.populateFilters();
                        UIRenderer.populateDrawerCategories();
                        ViewManager.renderCurrentView();
                        UIRenderer.renderStats();
                    }
                }
                return true;
            } catch (error) {
                console.error('Error loading fresh data:', error);
                return false;
            }
        };

        // 3. Return immediately if cached, otherwise wait for fetch
        if (isCachedLoaded) {
            fetchFreshData(); // Run in background
            return true;
        } else {
            return await fetchFreshData();
        }
    },

    getLessonsByPlaylist(playlist) {
        return AppState.lessons.filter(l => l.playlist === playlist);
    },

    getFilteredLessons() {
        let filtered = [...AppState.lessons];
        
        if (AppState.filters.playlist) {
            filtered = filtered.filter(l => l.playlist === AppState.filters.playlist);
        }
        if (AppState.filters.language) {
            filtered = filtered.filter(l => l.language === AppState.filters.language);
        }
        if (AppState.searchQuery) {
            const query = AppState.searchQuery.toLowerCase();
            filtered = filtered.filter(l => 
                l.title.toLowerCase().includes(query) ||
                l.playlist.toLowerCase().includes(query)
            );
        }
        
        return filtered;
    },

    getFavoriteLessons() {
        return AppState.lessons.filter(l => AppState.favorites.includes(l.id));
    },

    getRecentLessons() {
        const recentIds = AppState.recentlyWatched.slice(0, 10);
        return recentIds.map(id => AppState.lessons.find(l => l.id === id)).filter(Boolean);
    },

    getLessonById(id) {
        return AppState.lessons.find(l => l.id === id);
    },

    toggleFavorite(lessonId) {
        const index = AppState.favorites.indexOf(lessonId);
        if (index > -1) {
            AppState.favorites.splice(index, 1);
            Utils.saveToStorage('favorites', AppState.favorites);
            return false;
        }
        AppState.favorites.push(lessonId);
        Utils.saveToStorage('favorites', AppState.favorites);
        return true;
    },

    toggleCompleted(lessonId) {
        const index = AppState.completed.indexOf(lessonId);
        if (index > -1) {
            AppState.completed.splice(index, 1);
            Utils.saveToStorage('completed', AppState.completed);
            return false;
        }
        AppState.completed.push(lessonId);
        Utils.saveToStorage('completed', AppState.completed);
        return true;
    },

    addToRecent(lessonId) {
        const index = AppState.recentlyWatched.indexOf(lessonId);
        if (index > -1) AppState.recentlyWatched.splice(index, 1);
        AppState.recentlyWatched.unshift(lessonId);
        if (AppState.recentlyWatched.length > 20) AppState.recentlyWatched.pop();
        Utils.saveToStorage('recent', AppState.recentlyWatched);
    },

    getPlaylistProgress(playlist) {
        const lessons = this.getLessonsByPlaylist(playlist);
        const completed = lessons.filter(l => AppState.completed.includes(l.id)).length;
        return {
            total: lessons.length,
            completed,
            percent: lessons.length > 0 ? Math.round((completed / lessons.length) * 100) : 0
        };
    },

    getContinueLesson() {
        return AppState.lessons.find(l => l.videoId && !AppState.completed.includes(l.id));
    }
};

// ============================================
// UI RENDERERS
// ============================================
const UIRenderer = {
    renderWelcomeStats() {
        const total = AppState.lessons.filter(l => l.videoId).length;
        const completed = AppState.completed.length;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
        document.getElementById('welcomeProgress').textContent = `${percent}%`;
    },

    renderQuickActions() {
        document.querySelectorAll('.quick-action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                if (action === 'continue') {
                    const lesson = DataManager.getContinueLesson();
                    if (lesson) AppActions.openVideo(lesson);
                    else Utils.showToast('All lessons completed!');
                } else if (action === 'favorites') {
                    ViewManager.switchView('favorites');
                } else if (action === 'progress') {
                    ViewManager.switchView('progress');
                } else if (action === 'all') {
                    ViewManager.switchView('courses');
                }
            });
        });
    },

    renderContinueCard() {
        const section = document.getElementById('continueSection');
        const container = document.getElementById('continueCard');
        const lesson = DataManager.getContinueLesson();
        
        if (!lesson) {
            section.style.display = 'none';
            document.getElementById('fab').classList.add('hidden');
            return;
        }
        
        section.style.display = 'block';
        document.getElementById('fab').classList.remove('hidden');
        
        const progress = DataManager.getPlaylistProgress(lesson.playlist);
        
        container.innerHTML = `
            <div class="continue-thumbnail">
                <img src="${lesson.thumbnail}" alt="" loading="lazy">
                <div class="continue-overlay">
                    <button class="continue-play-btn">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            </div>
            <div class="continue-info">
                <h4>${lesson.title}</h4>
                <div class="continue-meta">
                    <span><i class="fas fa-list"></i> ${Utils.formatPlaylistName(lesson.playlist)}</span>
                    <span><i class="fas fa-globe"></i> ${Utils.getLanguageDisplay(lesson.playlist)}</span>
                </div>
                <div class="continue-progress">
                    <div class="continue-progress-bar">
                        <div class="continue-progress-fill" style="width: ${progress.percent}%"></div>
                    </div>
                    <span>${progress.percent}%</span>
                </div>
            </div>
        `;
        
        container.addEventListener('click', () => AppActions.openVideo(lesson));
        
        // FAB action
        document.getElementById('fab').onclick = () => AppActions.openVideo(lesson);
    },

    renderStats() {
        const total = AppState.lessons.filter(l => l.videoId).length;
        const completed = AppState.completed.length;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        document.getElementById('totalLessons').textContent = total;
        document.getElementById('totalPlaylists').textContent = AppState.playlists.length;
        document.getElementById('completedLessons').textContent = completed;
        document.getElementById('progressPercent').textContent = `${percent}%`;
        document.getElementById('favCount').textContent = AppState.favorites.length;
        document.getElementById('drawerFavCount').textContent = AppState.favorites.length;
    },

    renderFeaturedPlaylists() {
        const container = document.getElementById('featuredPlaylists');
        const featured = AppState.playlists.slice(0, 6);
        
        container.innerHTML = featured.map(playlist => {
            const lessons = DataManager.getLessonsByPlaylist(playlist);
            const progress = DataManager.getPlaylistProgress(playlist);
            
            return `
                <div class="playlist-card" data-playlist="${playlist}">
                    <div class="playlist-header" style="background: ${Utils.getCategoryColor(playlist)}">
                        <div class="playlist-icon"><i class="fas ${Utils.getCategoryIcon(playlist)}"></i></div>
                        <div class="playlist-name">${Utils.formatPlaylistName(playlist)}</div>
                    </div>
                    <div class="playlist-body">
                        <div class="playlist-count"><i class="fas fa-video"></i> ${lessons.length} lessons</div>
                        ${progress.percent > 0 ? `<div class="playlist-progress">${progress.percent}% complete</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        container.querySelectorAll('.playlist-card').forEach(card => {
            card.addEventListener('click', () => {
                AppState.filters.playlist = card.dataset.playlist;
                document.getElementById('playlistFilter').value = card.dataset.playlist;
                ViewManager.switchView('courses');
            });
        });
    },

    renderRecentLessons() {
        const container = document.getElementById('recentLessons');
        const recent = AppState.lessons.slice(-8).reverse();
        
        container.innerHTML = recent.map(lesson => `
            <div class="lesson-card-small" data-id="${lesson.id}">
                <div class="lesson-thumb">
                    <img src="${lesson.thumbnail}" alt="" loading="lazy">
                    <div class="lesson-thumb-overlay">
                        <div class="play-btn-small"><i class="fas fa-play"></i></div>
                    </div>
                </div>
                <div class="lesson-info-small">
                    <div class="lesson-title-small">${lesson.title}</div>
                    <div class="lesson-meta-small">
                        <span>${Utils.formatPlaylistName(lesson.playlist)}</span>
                    </div>
                </div>
            </div>
        `).join('');
        
        container.querySelectorAll('.lesson-card-small').forEach(card => {
            card.addEventListener('click', () => {
                const lesson = DataManager.getLessonById(card.dataset.id);
                if (lesson) AppActions.openVideo(lesson);
            });
        });
    },

    renderLessonCards(containerId, lessons, limit = null) {
        const container = document.getElementById(containerId);
        const displayLessons = limit ? lessons.slice(0, limit) : lessons;
        
        if (displayLessons.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        container.innerHTML = displayLessons.map(lesson => {
            const isCompleted = AppState.completed.includes(lesson.id);
            const isFavorite = AppState.favorites.includes(lesson.id);
            
            return `
                <div class="lesson-card ${isCompleted ? 'completed' : ''}" data-id="${lesson.id}">
                    <div class="lesson-thumbnail">
                        <img src="${lesson.thumbnail}" alt="" loading="lazy">
                        <div class="lesson-overlay">
                            <div class="play-icon"><i class="fas fa-play"></i></div>
                        </div>
                        ${lesson.hasNotes ? '<span class="lesson-badge"><i class="fas fa-file-pdf"></i></span>' : ''}
                    </div>
                    <div class="lesson-content">
                        <div class="lesson-card-title">${lesson.title}</div>
                        <div class="lesson-card-meta">
                            <span class="lesson-playlist-name">${Utils.formatPlaylistName(lesson.playlist)}</span>
                            ${lesson.hasNotes ? '<span class="lesson-has-notes"><i class="fas fa-file-alt"></i></span>' : ''}
                        </div>
                    </div>
                    <div class="lesson-actions-row">
                        <button class="lesson-action-btn primary" onclick="event.stopPropagation(); AppActions.playVideo('${lesson.id}')">
                            <i class="fas fa-play"></i> Watch
                        </button>
                        <button class="lesson-action-btn favorite ${isFavorite ? 'active' : ''}" onclick="event.stopPropagation(); AppActions.toggleFavorite('${lesson.id}')">
                            <i class="${isFavorite ? 'fas' : 'far'} fa-heart"></i>
                        </button>
                        ${lesson.pdfLink ? `
                            <a href="${lesson.pdfLink}" target="_blank" class="lesson-action-btn" onclick="event.stopPropagation()">
                                <i class="fas fa-file-pdf"></i>
                            </a>
                        ` : '<button class="lesson-action-btn" disabled><i class="fas fa-file-pdf"></i></button>'}
                    </div>
                </div>
            `;
        }).join('');
        
        // Add click handlers for cards
        container.querySelectorAll('.lesson-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't trigger if clicking action buttons
                if (e.target.closest('.lesson-action-btn')) return;
                const lesson = DataManager.getLessonById(card.dataset.id);
                if (lesson) AppActions.openVideo(lesson);
            });
        });
    },

    renderProgressView() {
        const total = AppState.lessons.filter(l => l.videoId).length;
        const completed = AppState.completed.length;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        // Update circle
        const circle = document.getElementById('progressCircle');
        const circumference = 2 * Math.PI * 42;
        const offset = circumference - (percent / 100) * circumference;
        if (circle) circle.style.strokeDashoffset = offset;
        
        document.getElementById('progressText').textContent = `${percent}%`;
        document.getElementById('progressCompleted').textContent = completed;
        document.getElementById('progressTotal').textContent = total;
        
        // Render by playlist
        const container = document.getElementById('progressByPlaylist');
        const progressData = AppState.playlists.map(p => ({
            playlist: p,
            ...DataManager.getPlaylistProgress(p)
        })).filter(p => p.total > 0).sort((a, b) => b.percent - a.percent);
        
        container.innerHTML = progressData.map(p => `
            <div class="progress-course-item">
                <div class="progress-course-header">
                    <span class="progress-course-name">${Utils.formatPlaylistName(p.playlist)}</span>
                    <span class="progress-course-percent">${p.percent}%</span>
                </div>
                <div class="progress-course-bar">
                    <div class="progress-course-fill" style="width: ${p.percent}%"></div>
                </div>
                <div class="progress-course-count">${p.completed} of ${p.total} lessons</div>
            </div>
        `).join('');
    },

    populateFilters() {
        const select = document.getElementById('playlistFilter');
        select.innerHTML = '<option value="">All Courses</option>' +
            AppState.playlists.map(p => `<option value="${p}">${Utils.formatPlaylistName(p)}</option>`).join('');
    },

    populateDrawerCategories() {
        const container = document.getElementById('drawerCategoryMenu');
        const categories = {};
        
        AppState.playlists.forEach(p => {
            const name = p.toLowerCase();
            let cat = 'Other';
            if (name.includes('jyotisha')) cat = 'Jyotisha';
            else if (name.includes('mana')) cat = 'Mana Shastra';
            else if (name.includes('prashna')) cat = 'Prashna';
            else if (name.includes('app')) cat = 'Apps';
            
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(p);
        });
        
        container.innerHTML = Object.entries(categories).map(([cat, playlists]) => `
            <li class="drawer-item" data-category="${cat}" data-playlist="${playlists[0]}">
                <i class="fas ${this.getCategoryIcon(cat)}"></i>
                <span>${cat}</span>
                <span class="drawer-badge">${playlists.length}</span>
            </li>
        `).join('');
        
        container.querySelectorAll('.drawer-item').forEach(item => {
            item.addEventListener('click', () => {
                AppState.filters.playlist = item.dataset.playlist;
                document.getElementById('playlistFilter').value = item.dataset.playlist;
                ViewManager.switchView('courses');
                UIControllers.closeDrawer();
            });
        });
    },

    getCategoryIcon(category) {
        const icons = {
            'Jyotisha': 'fa-star',
            'Mana Shastra': 'fa-brain',
            'Prashna': 'fa-question-circle',
            'Apps': 'fa-mobile-alt',
            'Other': 'fa-book'
        };
        return icons[category] || 'fa-book';
    }
};

// ============================================
// VIEW MANAGER
// ============================================
const ViewManager = {
    switchView(viewName) {
        // Update nav items
        document.querySelectorAll('.bottom-nav-item, .drawer-item, .nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === viewName);
        });
        
        // Hide all views
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        
        // Show selected
        const selected = document.getElementById(`${viewName}View`);
        if (selected) selected.classList.remove('hidden');
        
        // Update title
        const titles = {
            dashboard: 'Dashboard',
            courses: 'All Courses',
            favorites: 'Favorites',
            progress: 'Progress',
            recent: 'Recent',
            donate: 'Support Us'
        };
        const titleEl = document.getElementById('pageTitle');
        if (titleEl) titleEl.textContent = titles[viewName] || 'Dashboard';
        
        AppState.currentView = viewName;
        this.renderCurrentView();
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    renderCurrentView() {
        switch (AppState.currentView) {
            case 'dashboard':
                UIRenderer.renderWelcomeStats();
                UIRenderer.renderContinueCard();
                UIRenderer.renderStats();
                UIRenderer.renderFeaturedPlaylists();
                UIRenderer.renderRecentLessons();
                break;
            case 'courses':
                this.renderCoursesView();
                break;
            case 'favorites':
                this.renderFavoritesView();
                break;
            case 'progress':
                UIRenderer.renderProgressView();
                break;
            case 'recent':
                this.renderRecentView();
                break;
            case 'donate':
                // Donate view is static, no dynamic rendering needed
                break;
        }
    },

    renderCoursesView() {
        const lessons = DataManager.getFilteredLessons();
        const container = document.getElementById('lessonsContainer');
        const resultsCount = document.getElementById('resultsCount');
        const loadMoreContainer = document.getElementById('loadMoreContainer');
        
        resultsCount.textContent = `${lessons.length} lesson${lessons.length !== 1 ? 's' : ''}`;
        
        if (lessons.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <div class="empty-icon"><i class="fas fa-search"></i></div>
                    <h3>No lessons found</h3>
                    <p>Try adjusting your filters</p>
                </div>
            `;
            loadMoreContainer.style.display = 'none';
            return;
        }
        
        const displayLessons = lessons.slice(0, AppState.displayCount);
        UIRenderer.renderLessonCards('lessonsContainer', displayLessons);
        
        // Show/hide load more
        loadMoreContainer.style.display = lessons.length > AppState.displayCount ? 'block' : 'none';
    },

    renderFavoritesView() {
        const lessons = DataManager.getFavoriteLessons();
        const emptyState = document.getElementById('favEmptyState');
        const container = document.getElementById('favoritesContainer');
        
        if (lessons.length === 0) {
            emptyState.style.display = 'block';
            container.innerHTML = '';
        } else {
            emptyState.style.display = 'none';
            UIRenderer.renderLessonCards('favoritesContainer', lessons);
        }
    },

    renderRecentView() {
        const lessons = DataManager.getRecentLessons();
        const emptyState = document.getElementById('recentEmptyState');
        const container = document.getElementById('recentContainer');
        
        if (lessons.length === 0) {
            emptyState.style.display = 'block';
            container.innerHTML = '';
        } else {
            emptyState.style.display = 'none';
            UIRenderer.renderLessonCards('recentContainer', lessons);
        }
    }
};

// ============================================
// APP ACTIONS
// ============================================
const AppActions = {
    openVideo(lesson) {
        if (!lesson.videoId) {
            Utils.showToast('No video available', 'error');
            return;
        }
        
        AppState.currentVideo = lesson;
        
        const modal = document.getElementById('videoModal');
        const videoContainer = document.getElementById('videoContainer');
        const title = document.getElementById('videoTitle');
        const playlist = document.getElementById('videoPlaylist');
        const language = document.getElementById('videoLanguage');
        const pdfLink = document.getElementById('pdfLink');
        const markBtn = document.getElementById('markCompleteBtn');
        const favBtn = document.getElementById('addFavBtn');
        
        // Dynamically create iframe to optimize performance
        videoContainer.innerHTML = ''; // Clear any existing content
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${lesson.videoId}?autoplay=1&rel=0`;
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
        iframe.setAttribute('allowfullscreen', '');
        videoContainer.appendChild(iframe);
        
        title.textContent = lesson.title;
        playlist.innerHTML = `<i class="fas fa-list"></i> ${Utils.formatPlaylistName(lesson.playlist)}`;
        language.innerHTML = `<i class="fas fa-globe"></i> ${Utils.getLanguageDisplay(lesson.playlist)}`;
        
        if (lesson.pdfLink) {
            pdfLink.href = lesson.pdfLink;
            pdfLink.style.display = 'flex';
        } else {
            pdfLink.style.display = 'none';
        }
        
        const isCompleted = AppState.completed.includes(lesson.id);
        const isFavorite = AppState.favorites.includes(lesson.id);
        
        markBtn.innerHTML = `<i class="fas ${isCompleted ? 'fa-check-circle' : 'fa-check'}"></i><span>${isCompleted ? 'Completed' : 'Complete'}</span>`;
        markBtn.classList.toggle('primary', isCompleted);
        
        favBtn.innerHTML = `<i class="${isFavorite ? 'fas' : 'far'} fa-heart"></i><span>${isFavorite ? 'Saved' : 'Save'}</span>`;
        favBtn.classList.toggle('active', isFavorite);
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        DataManager.addToRecent(lesson.id);
        
        // Button handlers
        markBtn.onclick = () => {
            const completed = DataManager.toggleCompleted(lesson.id);
            markBtn.innerHTML = `<i class="fas ${completed ? 'fa-check-circle' : 'fa-check'}"></i><span>${completed ? 'Completed' : 'Complete'}</span>`;
            markBtn.classList.toggle('primary', completed);
            Utils.showToast(completed ? 'Marked complete!' : 'Removed from completed');
            UIRenderer.renderStats();
        };
        
        favBtn.onclick = () => {
            const favorited = DataManager.toggleFavorite(lesson.id);
            favBtn.innerHTML = `<i class="${favorited ? 'fas' : 'far'} fa-heart"></i><span>${favorited ? 'Saved' : 'Save'}</span>`;
            favBtn.classList.toggle('active', favorited);
            Utils.showToast(favorited ? 'Added to favorites!' : 'Removed from favorites');
            UIRenderer.renderStats();
        };
        
        // Share button
        document.getElementById('shareBtn').onclick = () => {
            document.getElementById('shareModal').classList.add('active');
        };
    },

    playVideo(lessonId) {
        const lesson = DataManager.getLessonById(lessonId);
        if (lesson) this.openVideo(lesson);
    },

    toggleFavorite(lessonId) {
        const favorited = DataManager.toggleFavorite(lessonId);
        Utils.showToast(favorited ? 'Added to favorites!' : 'Removed from favorites');
        UIRenderer.renderStats();
        
        // Re-render if needed
        if (AppState.currentView === 'favorites') ViewManager.renderFavoritesView();
        else if (AppState.currentView === 'courses') ViewManager.renderCoursesView();
        
        // Update button in modal if open
        if (AppState.currentVideo?.id === lessonId) {
            const favBtn = document.getElementById('addFavBtn');
            favBtn.innerHTML = `<i class="${favorited ? 'fas' : 'far'} fa-heart"></i><span>${favorited ? 'Saved' : 'Save'}</span>`;
            favBtn.classList.toggle('active', favorited);
        }
    },

    closeVideoModal() {
        const modal = document.getElementById('videoModal');
        const videoContainer = document.getElementById('videoContainer');
        
        // Remove iframe from DOM to stop video and free memory
        if (videoContainer) videoContainer.innerHTML = '';
        
        modal.classList.remove('active');
        document.body.style.overflow = '';
        AppState.currentVideo = null;
    },

    toggleTheme() {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem('epata_theme', isDark ? 'dark' : 'light');
        
        document.querySelectorAll('#themeToggle i, #themeToggleDesktop i, #themeToggleMobile i').forEach(icon => {
            icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        });
        
        document.querySelectorAll('#themeToggleDesktop span, #themeToggleMobile span').forEach(span => {
            span.textContent = isDark ? 'Light Mode' : 'Dark Mode';
        });
    }
};

// ============================================
// UI CONTROLLERS
// ============================================
const UIControllers = {
    init() {
        this.initSearch();
        this.initFilters();
        this.initNavigation();
        this.initDrawer();
        this.initShareModal();
        this.initPullToRefresh();
        this.initLoadMore();
        this.initNetworkStatus();
        this.initDonatePage();
    },

    initDonatePage() {
        // Copy UPI button
        const copyUpiBtn = document.getElementById('copyUpiBtn');
        if (copyUpiBtn) {
            copyUpiBtn.addEventListener('click', async () => {
                const upiNumber = '9482094290';
                try {
                    await navigator.clipboard.writeText(upiNumber);
                    Utils.showToast('UPI number copied!');
                } catch (err) {
                    // Fallback
                    const input = document.createElement('input');
                    input.value = upiNumber;
                    document.body.appendChild(input);
                    input.select();
                    document.execCommand('copy');
                    document.body.removeChild(input);
                    Utils.showToast('UPI number copied!');
                }
            });
        }
    },

    initSearch() {
        // Mobile search toggle
        const searchToggle = document.getElementById('searchToggle');
        const searchContainer = document.getElementById('searchBarContainer');
        const searchInput = document.getElementById('searchInput');
        const searchClear = document.getElementById('searchClear');
        
        searchToggle.addEventListener('click', () => {
            searchContainer.classList.toggle('active');
            if (searchContainer.classList.contains('active')) {
                searchInput.focus();
            }
        });
        
        searchInput.addEventListener('input', Utils.debounce((e) => {
            AppState.searchQuery = e.target.value;
            searchClear.classList.toggle('visible', e.target.value.length > 0);
            
            if (AppState.currentView !== 'courses') {
                ViewManager.switchView('courses');
            } else {
                ViewManager.renderCoursesView();
            }
        }, 300));
        
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            AppState.searchQuery = '';
            searchClear.classList.remove('visible');
            ViewManager.renderCoursesView();
        });
        
        // Desktop search
        const desktopSearch = document.getElementById('desktopSearchInput');
        if (desktopSearch) {
            desktopSearch.addEventListener('input', Utils.debounce((e) => {
                AppState.searchQuery = e.target.value;
                if (AppState.currentView !== 'courses') {
                    ViewManager.switchView('courses');
                } else {
                    ViewManager.renderCoursesView();
                }
            }, 300));
        }
        
        // Filter chips
        document.getElementById('filterKannada').addEventListener('click', function() {
            this.classList.toggle('active');
            AppState.filters.language = this.classList.contains('active') ? 'kannada' : '';
            document.getElementById('languageFilter').value = AppState.filters.language;
            ViewManager.switchView('courses');
        });
        
        document.getElementById('filterTelugu').addEventListener('click', function() {
            this.classList.toggle('active');
            AppState.filters.language = this.classList.contains('active') ? 'telugu' : '';
            document.getElementById('languageFilter').value = AppState.filters.language;
            ViewManager.switchView('courses');
        });
        
        document.getElementById('filterFavorites').addEventListener('click', function() {
            ViewManager.switchView('favorites');
        });
    },

    initFilters() {
        document.getElementById('playlistFilter').addEventListener('change', (e) => {
            AppState.filters.playlist = e.target.value;
            ViewManager.renderCoursesView();
        });
        
        document.getElementById('languageFilter').addEventListener('change', (e) => {
            AppState.filters.language = e.target.value;
            ViewManager.renderCoursesView();
        });
    },

    initNavigation() {
        // Bottom nav
        document.querySelectorAll('.bottom-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                ViewManager.switchView(item.dataset.view);
            });
        });
        
        // Drawer nav items
        document.querySelectorAll('.drawer-item[data-view]').forEach(item => {
            item.addEventListener('click', () => {
                ViewManager.switchView(item.dataset.view);
                this.closeDrawer();
            });
        });
        
        // Sidebar nav (desktop)
        document.querySelectorAll('.nav-item[data-view]').forEach(item => {
            item.addEventListener('click', () => {
                ViewManager.switchView(item.dataset.view);
            });
        });
        
        // See all buttons
        document.querySelectorAll('.see-all-btn, .empty-action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.view) ViewManager.switchView(btn.dataset.view);
            });
        });
    },

    initDrawer() {
        const menuBtn = document.getElementById('menuBtn');
        const drawer = document.getElementById('mobileDrawer');
        const overlay = document.getElementById('drawerOverlay');
        const closeBtn = document.getElementById('drawerClose');
        
        menuBtn.addEventListener('click', () => {
            drawer.classList.add('open');
            overlay.classList.add('active');
        });
        
        const close = () => {
            drawer.classList.remove('open');
            overlay.classList.remove('active');
        };
        
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', close);
    },

    closeDrawer() {
        document.getElementById('mobileDrawer').classList.remove('open');
        document.getElementById('drawerOverlay').classList.remove('active');
    },

    initShareModal() {
        const shareModal = document.getElementById('shareModal');
        
        document.getElementById('closeShareModal').addEventListener('click', () => {
            shareModal.classList.remove('active');
        });
        
        document.querySelectorAll('.share-option').forEach(option => {
            option.addEventListener('click', () => {
                const type = option.dataset.share;
                const lesson = AppState.currentVideo;
                if (!lesson) return;
                
                const url = `https://youtube.com/watch?v=${lesson.videoId}`;
                const text = `Check out: ${lesson.title}`;
                
                if (type === 'whatsapp') {
                    window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
                } else if (type === 'telegram') {
                    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
                } else if (type === 'copy') {
                    Utils.copyToClipboard(url);
                }
                
                shareModal.classList.remove('active');
            });
        });
    },

    initPullToRefresh() {
        let startY = 0;
        let isPulling = false;
        const pullIndicator = document.getElementById('pullToRefresh');
        const mainContent = document.getElementById('mainContent');
        
        mainContent.addEventListener('touchstart', (e) => {
            if (mainContent.scrollTop === 0) {
                startY = e.touches[0].clientY;
                isPulling = true;
            }
        }, { passive: true });
        
        mainContent.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            
            const currentY = e.touches[0].clientY;
            const diff = currentY - startY;
            
            if (diff > 60 && diff < 150) {
                pullIndicator.classList.add('visible');
                pullIndicator.querySelector('span').textContent = 'Release to refresh';
            }
        }, { passive: true });
        
        mainContent.addEventListener('touchend', () => {
            if (pullIndicator.classList.contains('visible')) {
                pullIndicator.querySelector('span').textContent = 'Refreshing...';
                
                setTimeout(() => {
                    pullIndicator.classList.remove('visible');
                    ViewManager.renderCurrentView();
                    Utils.showToast('Refreshed!');
                }, 1000);
            }
            isPulling = false;
        });
    },

    initLoadMore() {
        document.getElementById('loadMoreBtn').addEventListener('click', () => {
            AppState.displayCount += 12;
            ViewManager.renderCoursesView();
        });
    },

    initNetworkStatus() {
        const indicator = document.getElementById('offlineIndicator');
        
        window.addEventListener('online', () => {
            indicator.classList.remove('active');
            AppState.isOnline = true;
            Utils.showToast('Back online!');
        });
        
        window.addEventListener('offline', () => {
            indicator.classList.add('active');
            AppState.isOnline = false;
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    const loadingScreen = document.getElementById('loadingScreen');
    
    // Initialize controllers
    UIControllers.init();
    
    // Load theme
    const savedTheme = localStorage.getItem('epata_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        document.querySelectorAll('#themeToggle i, #themeToggleDesktop i, #themeToggleMobile i').forEach(icon => {
            icon.className = 'fas fa-sun';
        });
    }
    
    // Theme toggles
    document.getElementById('themeToggle').addEventListener('click', AppActions.toggleTheme);
    document.getElementById('themeToggleDesktop').addEventListener('click', AppActions.toggleTheme);
    document.getElementById('themeToggleMobile').addEventListener('click', AppActions.toggleTheme);
    
    // Close video modal
    document.getElementById('closeVideoModal').addEventListener('click', AppActions.closeVideoModal);
    document.getElementById('modalBack').addEventListener('click', AppActions.closeVideoModal);
    
    // Close modal on backdrop
    document.getElementById('videoModal').addEventListener('click', (e) => {
        if (e.target.id === 'videoModal') AppActions.closeVideoModal();
    });
    
    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            AppActions.closeVideoModal();
            document.getElementById('shareModal').classList.remove('active');
        }
    });
    
    // Load data
    const success = await DataManager.loadData();
    
    if (success) {
        UIRenderer.populateFilters();
        UIRenderer.populateDrawerCategories();
        UIRenderer.renderQuickActions();
        ViewManager.switchView('dashboard');
        
        setTimeout(() => loadingScreen.classList.add('hidden'), 1500);
    } else {
        loadingScreen.innerHTML = `
            <div class="loading-content">
                <div class="logo-pulse"><img src="logo.jpeg" alt="e-PATA" class="loading-logo"></div>
                <div class="loading-text">Error loading data. Please refresh.</div>
            </div>
        `;
    }
});

// Service Worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
}
