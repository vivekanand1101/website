/* ============================================================
   VIVEK ANAND - Website Scripts
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    /* ==================== BOOT SEQUENCE ==================== */
    const bootScreen = document.getElementById('boot-screen');
    const site = document.getElementById('site');
    const bootLines = document.getElementById('boot-lines');

    const hasBooted = sessionStorage.getItem('booted');

    const lines = [
        '> booting vivek.os v3.0 ...',
        '> loading Bihar kernel modules ........... OK',
        '> mounting /home/kerai/fields ............. OK',
        '> starting cricket-daemon ................ OK',
        '> initializing vim (obviously) ........... OK',
        '> connecting to chai-protocol ............ OK',
        '> loading projects from ~/code ........... OK',
        '> rendering paddy fields ................. OK',
        '',
        '> system ready. welcome.',
    ];

    if (hasBooted) {
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

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }, { passive: true });

    /* ==================== MOBILE MENU ==================== */
    const navToggle = document.getElementById('nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (navToggle) {
        navToggle.addEventListener('click', () => {
            navLinks.classList.toggle('open');
            navToggle.classList.toggle('active');
        });

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

    /* ==================== EMAIL COPY FALLBACK ==================== */
    const mailLink = document.querySelector('a[href^="mailto:"]');
    if (mailLink) {
        mailLink.addEventListener('click', (e) => {
            const email = mailLink.href.replace('mailto:', '');
            navigator.clipboard.writeText(email).then(() => {
                const original = mailLink.textContent;
                mailLink.textContent = 'Copied to clipboard ✓';
                setTimeout(() => { mailLink.textContent = original; }, 2000);
            });
        });
    }

    /* ==================== TESTIMONIAL CAROUSEL ==================== */
    const track = document.getElementById('testimonial-track');
    const dotsContainer = document.getElementById('carousel-dots');
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');

    if (track && dotsContainer) {
        const cards = track.querySelectorAll('.testimonial-card');
        const total = cards.length;
        let current = 0;
        let autoPlayTimer = null;

        // Create dots
        for (let i = 0; i < total; i++) {
            const dot = document.createElement('button');
            dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('aria-label', 'Go to testimonial ' + (i + 1));
            dot.addEventListener('click', () => goTo(i));
            dotsContainer.appendChild(dot);
        }

        const dots = dotsContainer.querySelectorAll('.carousel-dot');

        function goTo(index) {
            current = ((index % total) + total) % total;
            track.style.transform = 'translateX(-' + (current * 100) + '%)';
            dots.forEach((d, i) => d.classList.toggle('active', i === current));
            resetAutoPlay();
        }

        prevBtn.addEventListener('click', () => goTo(current - 1));
        nextBtn.addEventListener('click', () => goTo(current + 1));

        // Auto-rotate every 6 seconds
        function startAutoPlay() {
            autoPlayTimer = setInterval(() => goTo(current + 1), 6000);
        }

        function resetAutoPlay() {
            clearInterval(autoPlayTimer);
            startAutoPlay();
        }

        startAutoPlay();

        // Pause on hover
        track.addEventListener('mouseenter', () => clearInterval(autoPlayTimer));
        track.addEventListener('mouseleave', () => startAutoPlay());

        // Swipe support for mobile
        let touchStartX = 0;
        let touchEndX = 0;

        track.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        track.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            const diff = touchStartX - touchEndX;
            if (Math.abs(diff) > 50) {
                if (diff > 0) goTo(current + 1);
                else goTo(current - 1);
            }
        }, { passive: true });
    }

    /* ==================== HERO ENTRANCE ==================== */
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
