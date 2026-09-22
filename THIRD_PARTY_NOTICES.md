# Third-party notices

The code I wrote in this repo is under the MIT license in `LICENSE`. The things below came from elsewhere and keep their own licenses. Nothing here grants any rights to DIII-D experimental data, and the DIII-D name does not imply endorsement by General Atomics or the U.S. Department of Energy.

## UI components

The files in `components/ui/` were generated from the shadcn/ui registry (MIT, Copyright (c) 2023 shadcn) and build on Base UI (`@base-ui/react`, MIT). They have been edited in place for this project. Icons are from Lucide (ISC).

## Runtime dependencies

Installed via pnpm; each package ships its own license file under `node_modules/`. The main ones:

| Package | License |
|---|---|
| react, react-dom, react-server-dom-webpack | MIT |
| recharts | MIT |
| vinext | MIT |
| lucide-react | ISC |
| @base-ui/react, @shadcn/react, shadcn | MIT |
| class-variance-authority, clsx, tailwind-merge, tw-animate-css | MIT |
| cmdk, embla-carousel-react, input-otp, react-day-picker, react-resizable-panels | MIT |
| date-fns | MIT |

## Development dependencies

| Package | License |
|---|---|
| vite, @vitejs/plugin-react, @vitejs/plugin-rsc | MIT |
| typescript | Apache-2.0 |
| tailwindcss, @tailwindcss/postcss | MIT |
| @cloudflare/vite-plugin, @cloudflare/workers-types, wrangler | MIT or Apache-2.0 |
| oxlint, oxfmt, oxlint-tsgolint | MIT |

## Python

`python/d3gate` has no required dependencies. The optional engine extra uses NumPy (BSD-3-Clause).

## Scientific references

The Solov'ev analytic equilibrium and the Grad-Shafranov formulation follow the standard textbook treatments cited in `science/equations.md`. No code was copied from other simulation packages.

If I have listed a license incorrectly or missed a notice, open an issue and I will fix it.
