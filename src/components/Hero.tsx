const Hero = () => (
  <section className="hero" aria-labelledby="intro-title">
    <div>
      {/* The header already shows the name; this heading is for screen readers and search engines. */}
      <h1 id="intro-title" className="sr-only">Vivek Anand</h1>
      <p>I’m Vivek, a product engineer from <a href="https://www.google.com/maps/search/?api=1&query=Kerai%2C+Bihar%2C+India" target="_blank" rel="noopener noreferrer">Kerai</a>, a small village in Bihar, India. I started on the backend and it’s still where I’m most comfortable, but these days I work across the whole product: working out what to build, designing it, building the frontend and the backend, and leading the team that ships it. That’s how I’ve worked at Barq and now at Virtual Internships. The role is remote, so for now I’m based at home in Kerai.</p>
      <p>Cricket was my first love. I grew up playing it in the village and kept at it through college and at work whenever I could. As time and a full team got harder to find, table tennis filled the gap, and these days I’ll happily play either when I get the chance.</p>
    </div>
    <figure className="portrait">
      <img src="/images/vivek.png" alt="Vivek Anand smiling outdoors in sunglasses" width="1264" height="842" />
      <figcaption>Cricket, chai, and a little curiosity.</figcaption>
    </figure>
  </section>
);

export default Hero;
