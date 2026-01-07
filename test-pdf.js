const pdfParse = require("pdf-parse");

console.log("Type:", typeof pdfParse);
console.log("Keys:", Object.keys(pdfParse));

try {
    if (typeof pdfParse === 'function') {
        console.log("It is a function!");
    } else if (pdfParse.default && typeof pdfParse.default === 'function') {
        console.log("It has a default function!");
    } else {
        console.log("It is an object:");
        console.log(JSON.stringify(pdfParse, null, 2));
    }
} catch (e) {
    console.error("Error inspecting:", e);
}
