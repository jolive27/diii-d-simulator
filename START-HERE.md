# Start here

Your simulator project is saved in the **DIII-D-Simulator** folder on your Desktop.

1. Open `Launch Simulator.command` to start the local simulator. Keep the Terminal window open.
2. Use the sliders to set current, field, heating, fueling, elongation, and triangularity.
3. Click **Run virtual shot**. Changed sliders do not affect an already completed shot until you run again.
4. Move the time slider or click **Play shot** to follow the discharge and its computed equilibrium.
5. Click **Export shot** to save the program, traces, assumptions, and selected equilibrium as JSON.

The baseline begins with an already formed plasma. Heating runs from 1–4 seconds. Shape is held fixed during a shot. You can change shape between runs.

Some combinations leave the reduced model's supported regime. The app displays a clear message; an unsupported equilibrium does not imply that DIII-D itself cannot operate there. No disruption or stability model is included.

The **docs** folder explains the architecture, equations, assumptions, checks, and original project brief. The **examples** folder contains the baseline synthetic result. The **physics** folder contains the independent numerical engine; the **app** folder contains the controls and plots.
