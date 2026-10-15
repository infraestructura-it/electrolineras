# Licencias de activación (solo Infraestructura-IT)

Cada empresa necesita una licencia firmada por IIT para operar: indica su **NIT**, el **número
máximo de cargadores** y la **fecha de vencimiento**. El servidor del cliente la verifica sin
internet con la llave pública; solo IIT, con la llave privada, puede emitirlas.

## 1. Crear las llaves (una sola vez, en un equipo de IIT)

```powershell
node herramientas\licencias\licencias-iit.js llaves C:\IIT\llaves
```

- `iit-licencias-privada.pem` es **secreta**: guárdala con respaldo, fuera del repositorio. Si se
  pierde no se pueden emitir más licencias para esa llave; si se filtra, cualquiera podría hacerlo.
- Copia `iit-licencias-publica.pem` a `backend/licencia-publica.pem`, haz commit y push. Desde que
  ese archivo existe en el servidor, el licenciamiento queda **activo**. (También sirve la variable
  `LICENCIA_CLAVE_PUBLICA` con la ruta del archivo.)

## 2. Emitir una licencia

```powershell
node herramientas\licencias\licencias-iit.js emitir --privada C:\IIT\llaves\iit-licencias-privada.pem `
  --empresa "Cargas SAS" --nit 900123456-7 --cargadores 10 --vence 2027-12-31
```

Imprime un texto largo: se le envía al cliente y él lo pega en el panel, **Licencias → Activar
licencia**. El NIT debe coincidir con el de la empresa (Empresas → NIT).

## 3. Reglas en la plataforma

| Situación | Qué pasa |
|---|---|
| Sin `licencia-publica.pem` | Licenciamiento desactivado (instalaciones de prueba); el panel lo avisa |
| Licencia vigente | Todo funciona; el panel avisa 30 días antes del vencimiento |
| Cargadores al límite | No deja registrar más cargadores en esa empresa |
| Vencida (7 días de gracia) | Sigue funcionando con aviso |
| Vencida después de la gracia, o sin licencia | No se inician cargas nuevas y los cargadores de la empresa reciben `Rejected` al conectarse |

Para renovar o ampliar se emite una licencia nueva para el mismo NIT; al activarla reemplaza la anterior.
