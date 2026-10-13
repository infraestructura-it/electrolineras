// Configuración de PM2 para producción (probada en Windows Server 2019).
//
// Uso (desde la raíz del repo, con los dos proyectos ya compilados):
//   pm2 start ecosystem.config.js
//   pm2 save
//
// En Windows PM2 no puede lanzar "npm start" directamente y no interpreta bien
// "-- start -p 3001" en la línea de comandos; por eso se apunta al binario de Next
// y los argumentos van en "args".

const path = require('path');

module.exports = {
  apps: [
    {
      name: 'electrolineras',
      cwd: path.join(__dirname, 'backend'),
      script: 'dist/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'electrolineras-front',
      cwd: path.join(__dirname, 'frontend'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
