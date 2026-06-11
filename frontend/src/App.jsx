import { useState } from 'react'
import './App.css'

function App() {
  return (
    <div className="App">
      <header className="header">
        <h1>Petar's DevOps Portfolio</h1>
        <p>Building Cloud Infrastructure & Kubernetes Solutions</p>
      </header>

      <main className="main">
        <section className="section">
          <h2>About Me</h2>
          <p>
            DevOps Engineer specializing in Kubernetes, Docker, Terraform, and CI/CD pipelines.
            Currently building this portfolio to showcase my infrastructure automation skills.
          </p>
        </section>

        <section className="section">
          <h2>Tech Stack</h2>
          <div className="tech-grid">
            <div className="tech-item">🐳 Docker</div>
            <div className="tech-item">☸️ Kubernetes (K3s)</div>
            <div className="tech-item">🏗️ Terraform</div>
            <div className="tech-item">📊 Prometheus</div>
            <div className="tech-item">📈 Grafana</div>
            <div className="tech-item">🔄 GitHub Actions</div>
            <div className="tech-item">⚛️ React</div>
            <div className="tech-item">🐧 Linux (CentOS)</div>
          </div>
        </section>

        <section className="section">
          <h2>Infrastructure</h2>
          <ul>
            <li>Local K3s Kubernetes cluster</li>
            <li>Containerized applications with Docker</li>
            <li>Infrastructure as Code with Terraform</li>
            <li>Monitoring with Prometheus & Grafana</li>
            <li>CI/CD with GitHub Actions</li>
          </ul>
        </section>

        <section className="section">
          <h2>GitHub</h2>
          <p>
            <a href="https://github.com/Petar-Dev-Port/devops-portfolio" target="_blank">
              View the full source code and infrastructure configs →
            </a>
          </p>
        </section>
      </main>

      <footer className="footer">
        <p>Built with React • Deployed on Kubernetes • Monitored with Prometheus</p>
      </footer>
    </div>
  )
}

export default App
