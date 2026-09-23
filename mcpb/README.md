# Dimensions Analytics desktop extension

This extension runs the Dimensions Analytics MCP server locally in Claude Desktop. It sends your API key to Dimensions for authentication and sends your queries to the Dimensions Analytics API. API access requires an active subscription. Claude stores the key entered in the extension settings as sensitive configuration.

The bundle uses the same server implementation as the npm package and hosted HTTP transport. Packaging its stdio entry preserves local-only tools and does not depend on hosted-service availability. The package version, extension version, git tag, and GitHub release match.

See the [Dimensions privacy policy](https://www.dimensions.ai/privacy/) and [installation guide](https://github.com/digital-science/dimensions-analytics-mcp/blob/main/docs/INSTALLATION.md).

Extensions installed from a downloaded `.mcpb` file must be updated by downloading and installing the new file. The server inside this bundle does not install updates from npm.
