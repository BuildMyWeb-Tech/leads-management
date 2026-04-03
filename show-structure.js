// show-structure.js
const fs = require("fs");
const path = require("path");

function showTree(dir, indent = "") {
    for (const item of fs.readdirSync(dir)) {
        if (item === "node_modules") continue; // Skip node_modules
        const fullPath = path.join(dir, item);
        const stats = fs.statSync(fullPath);
        console.log(indent + (stats.isDirectory() ? "📁 " : "📄 ") + item);
        if (stats.isDirectory()) showTree(fullPath, indent + "   ");
    }
}

showTree(".");