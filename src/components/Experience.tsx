const experiences = [
  {
    title: "Lead Engineer, Backend",
    company: "Virtual Internships",
    location: "Remote",
    period: "Dec 2024 – Current",
    description: "I lead a backend team of 6 at Virtual Internships, building a platform for 200k+ interns. My work includes AI-powered workflows, from Slack interactions to an onboarding process shortened by 80%. I'm transforming an operations-heavy business to be agent-first."
  },
  {
    title: "Technical Lead",
    company: "Barq",
    location: "Saudi Arabia",
    period: "Mar 2023 – Dec 2024",
    description: "As a founding engineer at Barq, I built core onboarding, KYC, and authentication services as the platform grew to 15M+ verified users."
  },
  {
    title: "SDE II Backend",
    company: "Innovaccer",
    location: "India",
    period: "Aug 2019 – Mar 2023",
    description: "At Innovaccer, I built a range of healthcare products, including Patient 360, a video-calling application, a referral management system, and a sync system between MongoDB and Elasticsearch."
  },
  {
    title: "SDE I",
    company: "PaySense (Acquired by PayU)",
    location: "India",
    period: "Feb 2018 – Jul 2019",
    description: "At PaySense, I built the repayment service for the fintech's lending platform."
  },
  {
    title: "SDE I",
    company: "Ethereal Machines",
    location: "India",
    period: "Aug 2017 – Feb 2018",
    description: "At Ethereal Machines, I built a prototype connecting a 3D printer to the user’s browser in real time."
  },
  {
    title: "Open Source Contributor",
    company: "Pagure (Fedora Project)",
    location: "Remote",
    period: "May 2015 – Aug 2017",
    description: "My early work was in open source: I contributed 170+ commits to Pagure over more than two years, including a Google Summer of Code 2016 project, and built Pagure Importer."
  }
];

const Experience = () => (
  <section className="editorial-section">
    <h2>Experience</h2>
    <div className="experience-list">
      {experiences.map(exp => (
        <article className="experience-entry" key={exp.company}>
          <p className="eyebrow">{exp.period} · {exp.location}</p>
          <h3>{exp.company}</h3>
          <p className="role">{exp.title}</p>
          <p>{exp.description}</p>
        </article>
      ))}
    </div>
  </section>
);

export default Experience;
