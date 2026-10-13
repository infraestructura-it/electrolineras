import 'reflect-metadata';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { OcppGatewayService } from './modules/ocpp-gateway/ocpp-gateway.service';

// Carga backend/.env (CLAVE=valor por línea) sin dependencias extra.
// Las variables ya definidas en el entorno tienen prioridad.
function cargarEnv() {
  const archivo = join(__dirname, '..', '.env');
  if (!existsSync(archivo)) return;
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

async function bootstrap() {
  cargarEnv();
  const app = await NestFactory.create(AppModule);

  // El frontend (Next.js, puerto 3001) llama a la API desde el navegador en otro origen.
  // Sin CORS el navegador bloquea esas peticiones.
  app.enableCors();

  // El gateway OCPP comparte el puerto de la API: ws://<servidor>:<PORT>/ocpp/<numero_serie>
  app.get(OcppGatewayService).adjuntar(app.getHttpServer());

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`Electrolineras backend escuchando en el puerto ${port} (API y OCPP en /ocpp)`);
}

bootstrap();
