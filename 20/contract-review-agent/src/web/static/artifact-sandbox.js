class ArtifactSandbox extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; height: 100%; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; }
        .toolbar { padding: 8px 12px; background: #fafafa; border-bottom: 1px solid #e0e0e0; font-size: 13px; color: #555; display: flex; justify-content: space-between; align-items: center; }
        iframe { width: 100%; height: calc(100% - 37px); border: none; }
      </style>
      <div class="toolbar">
        <span>Artifact 沙盒</span>
        <span id="artifact-name">未加载</span>
      </div>
      <iframe id="sandbox" sandbox="allow-same-origin allow-scripts" src="about:blank"></iframe>
    `;
  }

  loadUrl(url) {
    const iframe = this.shadowRoot.getElementById("sandbox");
    const name = this.shadowRoot.getElementById("artifact-name");
    iframe.src = url;
    name.textContent = url.split("/").pop() || url;
  }

  loadHtml(html) {
    const iframe = this.shadowRoot.getElementById("sandbox");
    const name = this.shadowRoot.getElementById("artifact-name");
    const blob = new Blob([html], { type: "text/html" });
    iframe.src = URL.createObjectURL(blob);
    name.textContent = "inline-report.html";
  }
}

customElements.define("artifact-sandbox", ArtifactSandbox);
