import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // El frontend (Next.js, puerto 3001) llama a la API desde el navegador en otro origen.
  // Sin CORS el navegador bloquea esas peticiones.
  app.enableCors();

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`Electrolineras backend escuchando en el puerto ${port}`);
}

bootstrap();
