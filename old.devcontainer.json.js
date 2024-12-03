// Configuration of server image and settings in Codespaces
// File format: https://aka.ms/devcontainer.json. 
let i={
	// Or use a Dockerfile or Docker Compose file. More info: https://containers.dev/guide/dockerfile
	"image": "mcr.microsoft.com/devcontainers/universal:2",
	// Features to add to the dev container. More info: https://containers.dev/features.
	"features": {
		"ghcr.io/devcontainers-contrib/features/http-server:1": {}
	},
	// Use 'postStartCommand' to run commands after the container is started.
	"postStartCommand": "nohup bash -c 'http-server -c-1 > .nohup_webserver.out 2>&1 & rm nohup.out &'", // start webserver without cache on port 8080 nocache and leave it running in background
	
	// Use 'forwardPorts' to make a list of ports inside the container available locally.
	"forwardPorts": [
		8080
	],
	"portsAttributes": {
		"8080": {
			"label": "Webserver",
			"onAutoForward": "openPreview"
		}
	},
	
	// Configure tool-specific properties.
	"customizations": {
		// Configure properties specific to VS Code.
		"vscode": {
			"extensions": [
				"ms-vsliveshare.vsliveshare", // add google-docs like typing in same file, click on live-share button in left icon pane
				"mhutchie.git-graph" // add graphical viewer for branches and commits, click on button in Source-Code tab
			]
		}
	}
}
