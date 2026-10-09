import { migrate } from "../src/setup";

// O worker já aplica as migrations ao iniciar; este comando fica para deploy/CI.
await migrate();
console.log("migrations em dia");
