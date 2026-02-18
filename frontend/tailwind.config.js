/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "#0B0E14",
                panel: {
                    DEFAULT: "#151921CC",
                    hover: "#1C222DCC",
                },
                cyber: {
                    blue: "#00D1FF",
                    amber: "#FFB000",
                    red: "#FF3B30",
                },
            },
            fontFamily: {
                mono: ['"Roboto Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
            },
            backdropBlur: {
                xs: '2px',
            }
        },
    },
    plugins: [],
}
