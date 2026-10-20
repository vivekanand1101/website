const Hero = () => (
  <section className="hero" aria-labelledby="intro-title">
    <div>
      <h1 id="intro-title">Vivek Anand</h1>
      <p>I’m from Kerai, a village in Bihar, India. I work remotely from home. Morning walks, chai, and a game of cricket or table tennis are some of the things I enjoy.</p>
      <p>Cricket has been a constant. I captained IIIT Allahabad’s team, and in 2017 we brought home the college’s first tournament trophy. I picked up table tennis at Innovaccer and got surprisingly good at it. Still quite proud of that.</p>
      <p>Professionally, I’m a software engineer, mostly working in backend development. I build systems and lead teams across fintech, healthtech, and B2B SaaS, and <a href="/writings/">write about software and what I learn along the way</a>. My first computer, bought by my father in 2004, was mostly used for Road Rash and EA Cricket. The engineering came later.</p>
    </div>
    <figure className="portrait">
      <img src="/images/vivek.png" alt="Vivek Anand smiling outdoors in sunglasses" width="1264" height="842" />
      <figcaption>Cricket, chai, and a little curiosity.</figcaption>
    </figure>
  </section>
);

export default Hero;
