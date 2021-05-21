
function escapeShell(command) {
    return `'${command.replace(/'/g, `'\\''`)}'`;
}

function validateAndMergeConfig(pluginConfig) {
    const config = {
        chartDirectory: ".",
        useOCIFeature: false,
        versionUpdatePolicy: "sync",
        appVersionUpdatePolicy: "sync",
        ...pluginConfig
    }

    if (!config.repository) {
        throw new Error('Missing config: `registry`');
    }

    return config;
}

module.exports = {
    validateAndMergeConfig,
    escapeShell
}