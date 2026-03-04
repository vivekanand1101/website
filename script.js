/* ============================================================
   VIVEK ANAND — Website Scripts
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    /* ==================== BOOT SEQUENCE ==================== */
    const bootScreen = document.getElementById('boot-screen');
    const site = document.getElementById('site');
    const bootLines = document.getElementById('boot-lines');

    // Skip boot on revisit (session)
    const hasBooted = sessionStorage.getItem('booted');

    const lines = [
        '> booting vivek.os v3.0 ...',
        '> loading Bihar kernel modules ........... OK',
        '> mounting /home/bihar/fields ............ OK',
        '> starting cricket-daemon ................ OK',
        '> initializing vim (obviously) ........... OK',
        '> connecting to chai-protocol ............ OK',
        '> loading projects from ~/code ........... OK',
        '> rendering paddy fields ................. OK',
        '',
        '> system ready. welcome.',
    ];

    if (hasBooted) {
        // Instant show
        bootScreen.classList.add('done');
        site.classList.remove('site-hidden');
        site.classList.add('site-visible');
    } else {
        let i = 0;
        const interval = setInterval(() => {
            if (i < lines.length) {
                const div = document.createElement('div');
                div.className = 'boot-line';
                div.textContent = lines[i];
                div.style.animationDelay = '0s';
                bootLines.appendChild(div);
                i++;
            } else {
                clearInterval(interval);
                setTimeout(() => {
                    bootScreen.classList.add('done');
                    site.classList.remove('site-hidden');
                    site.classList.add('site-visible');
                    sessionStorage.setItem('booted', '1');
                }, 600);
            }
        }, 180);
    }

    /* ==================== NAVBAR SCROLL ==================== */
    const navbar = document.getElementById('navbar');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        if (scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        lastScroll = scrollY;
    }, { passive: true });

    /* ==================== MOBILE MENU ==================== */
    const navToggle = document.getElementById('nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (navToggle) {
        navToggle.addEventListener('click', () => {
            navLinks.classList.toggle('open');
            // Animate hamburger
            navToggle.classList.toggle('active');
        });

        // Close menu on link click
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('open');
                navToggle.classList.remove('active');
            });
        });
    }

    /* ==================== FADE IN ON SCROLL ==================== */
    const fadeEls = document.querySelectorAll('.fade-in');

    const fadeObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    fadeObserver.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    fadeEls.forEach(el => fadeObserver.observe(el));

    /* ==================== SMOOTH NAV LINKS ==================== */
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    /* ==================== CRICKET SCOREBOARD ==================== */
    const scoreEl = document.getElementById('score');
    const wicketsEl = document.getElementById('wickets');
    const oversEl = document.getElementById('overs');
    const crrEl = document.getElementById('crr');

    if (scoreEl) {
        let score = 0;
        let wickets = 0;
        let balls = 0;
        let scorecardStarted = false;

        const outcomes = [0, 0, 1, 1, 1, 1, 2, 2, 3, 4, 4, 6, 'W'];

        const scoreObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting && !scorecardStarted) {
                        scorecardStarted = true;
                        runScorecard();
                        scoreObserver.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.5 }
        );

        scoreObserver.observe(scoreEl.closest('.scoreboard'));

        function runScorecard() {
            const interval = setInterval(() => {
                if (wickets >= 10 || balls >= 120) {
                    clearInterval(interval);
                    return;
                }

                const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];

                if (outcome === 'W') {
                    wickets++;
                } else {
                    score += outcome;
                }

                balls++;
                const overs = Math.floor(balls / 6);
                const ballsInOver = balls % 6;

                scoreEl.textContent = score;
                wicketsEl.textContent = wickets;
                oversEl.textContent = `${overs}.${ballsInOver}`;
                crrEl.textContent = balls > 0 ? (score / (balls / 6)).toFixed(2) : '0.00';
            }, 800);
        }
    }

    /* ==================== TYPING EFFECT FOR HERO ==================== */
    // The hero content types in after boot
    const heroTerminal = document.querySelector('.hero-terminal');
    if (heroTerminal && !hasBooted) {
        heroTerminal.style.opacity = '0';
        heroTerminal.style.transform = 'translateY(16px)';
        heroTerminal.style.transition = 'opacity 0.8s ease, transform 0.8s ease';

        const heroLinks = document.querySelector('.hero-links');
        if (heroLinks) {
            heroLinks.style.opacity = '0';
            heroLinks.style.transform = 'translateY(16px)';
            heroLinks.style.transition = 'opacity 0.8s ease 0.3s, transform 0.8s ease 0.3s';
        }

        // Wait for boot to finish
        setTimeout(() => {
            heroTerminal.style.opacity = '1';
            heroTerminal.style.transform = 'translateY(0)';
            if (heroLinks) {
                heroLinks.style.opacity = '1';
                heroLinks.style.transform = 'translateY(0)';
            }
        }, lines.length * 180 + 800);
    }
});
