const Skills = () => {
  const skillCategories = [
    {
      title: "Languages & Frameworks",
      skills: [
        "Python", "Go", "C", "JavaScript", "TypeScript", "NodeJS", "NestJS", "Django", "Flask", "FastAPI", "Tornado"
      ]
    },
    {
      title: "Databases & Storage", 
      skills: [
        "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch"
      ]
    },
    {
      title: "Infrastructure & DevOps",
      skills: [
        "Kubernetes", "Docker", "AWS", "Kafka", "Celery", "Microservices"
      ]
    },
    {
      title: "Applied AI",
      skills: [
        "LangChain", "LangGraph", "MCP", "RAG", "Natural Language Processing"
      ]
    },
    {
      title: "Core Strengths",
      skills: [
        "System Architecture", "Team Leadership", "Product Thinking", 
        "Mentorship", "Scalable Systems", "Performance Optimization"
      ]
    }
  ];

  return <section className="editorial-section"><h2>Technical practice</h2><dl className="skills-list">{skillCategories.map(category => <div key={category.title}><dt>{category.title}</dt><dd>{category.skills.join(', ')}</dd></div>)}</dl></section>;
};
export default Skills;
