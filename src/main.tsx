import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { vk } from "./game/services/VKBridgeService";

// VKWebAppInit должен улететь как можно раньше — до загрузки Phaser и шрифтов,
// иначе лоадер ВК может не дождаться и показать «Ошибка, перезагрузить».
void vk.init();

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
