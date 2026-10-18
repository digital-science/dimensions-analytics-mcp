# Dimensions Analytics desktop extension

This extension runs the Dimensions Analytics MCP server locally in Claude Desktop. It sends your API key to Dimensions for authentication and sends your queries to the Dimensions Analytics API. API access requires an active subscription. Claude stores the key entered in the extension settings as sensitive configuration.

The bundle uses the same server implementation as the npm package and hosted HTTP transport. Packaging its stdio entry preserves local-only tools and does not depend on hosted-service availability. The package version, extension version, git tag, and GitHub release match.

See the [Dimensions privacy policy](https://www.dimensions.ai/privacy/) and [installation guide](https://github.com/digital-science/dimensions-analytics-mcp/blob/main/docs/INSTALLATION.md).

Extensions installed from a downloaded `.mcpb` file must be updated by downloading and installing the new file. The server inside this bundle does not install updates from npm.

## Privacy Policy

This extension runs on your computer. It sends your API key and your queries only to the Dimensions API at the instance you configure (app.dimensions.ai by default). With each request it also sends usage metadata: the tool name, the extension version, the MCP client name, and a random session ID created when the server starts. Digital Science uses this metadata to monitor and improve the service. The extension doesn't send data to any other service, and the Claude Desktop extension doesn't check npm for updates.

How Digital Science collects, uses, stores, shares, and retains this data, and how to contact us, is described in the [Dimensions privacy policy](https://www.dimensions.ai/privacy/). Questions: supportapi@dimensions.ai.
