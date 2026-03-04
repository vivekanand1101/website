// Fade-in on scroll
document.addEventListener('DOMContentLoaded', () => {
    const sections = document.querySelectorAll('.section, .hero');

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        },
        { threshold: 0.1 }
    );

    sections.forEach((section) => {
        section.classList.add('fade-in');
        observer.observe(section);
    });
});
