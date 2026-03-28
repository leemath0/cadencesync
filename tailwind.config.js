/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                neon: {
                    green: "#39ff14",
                    yellow: "#ccff00"
                },
                dark: {
                    900: "#0b0c10",
                    800: "#1f2833"
                }
            }
        },
    },
    plugins: [],
}
