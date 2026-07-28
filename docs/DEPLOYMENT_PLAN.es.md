# Plan de puesta en línea: el plan, las opciones y los costos

**Para:** CECODES
**Fecha:** 28 de julio de 2026
**Asunto:** Cómo la herramienta de Huella de Carbono queda disponible en internet para sus empresas afiliadas

---

## En 30 segundos

La herramienta está terminada y probada: calcula exactamente igual que su Excel. Ahora hay que ponerla en internet. Hay 3 formas de hacerlo; recomendamos la **Opción B (Profesional)**: aproximadamente **US$45 al mes** (unos $180.000 pesos; hasta US$65 si el servicio de hosting exige un puesto adicional para nuestro acceso técnico, lo confirmamos antes de que paguen nada). Incluye copias de seguridad automáticas todos los días, soporte de los proveedores, y cero riesgo de que la herramienta se apague sola. La dirección sería **huella.cecodes.org.co**, usando el dominio que CECODES ya tiene, sin costo extra. Las cuentas y los pagos quedan a nombre de CECODES: la herramienta y los datos son suyos.

Para empezar necesitamos 4 cosas de ustedes: (1) las dos respuestas del documento anterior (urea y meta), (2) aprobar la Opción B con una tarjeta lista, (3) confirmar la dirección web, y (4) elegir la empresa piloto. Todo lo demás lo hacemos nosotros. Del "sí" al piloto terminado: **unos 10 días** (2 a 3 días de preparación y una semana de piloto).

Si están de acuerdo, respondan con este modelo: **"Opción B, adelante, con huella.cecodes.org.co y [nombre de la empresa piloto]"**.

---

## Dónde estamos hoy

La herramienta está **terminada y probada**. Calcula exactamente como su Excel (lo comprobamos contra el ejemplo que viene dentro del archivo que nos enviaron), las empresas pueden ingresar sus datos, ver su tablero y descargar reportes. Quedan dos decisiones pequeñas del documento anterior (el factor de la urea y la Meta) esperando su respuesta; las aplicamos antes de que empiece el piloto, así que respondiendo las dos junto con esto se cierra todo.

Hoy la herramienta solo funciona en nuestros computadores, donde la construimos; todavía no está en internet. Para que sus empresas afiliadas la usen, tiene que estar **en línea**: disponible las 24 horas, en una dirección web propia, con los datos guardados de forma segura. Este documento explica las formas de hacerlo, cuánto cuesta cada una, y cuál recomendamos.

---

## Qué significa "en línea": cuatro piezas

1. **Hosting (alojamiento):** los computadores que mantienen la herramienta funcionando 24/7. La oficina donde la herramienta trabaja.
2. **Base de datos:** donde se guarda cada número que las empresas ingresan, con llaves y copias diarias. El archivador.
3. **Dirección web:** lo que la gente escribe para abrir la herramienta. La dirección de la oficina.
4. **Correos del sistema:** la herramienta envía pequeños correos automáticos (por ejemplo, el enlace para recuperar una contraseña olvidada). Con su volumen, esto viene incluido sin costo extra; más adelante, si quieren que esos correos salgan desde una dirección @cecodes.org.co, es una configuración pequeña adicional.

La herramienta ya está construida para funcionar sobre dos servicios profesionales muy conocidos, usados por miles de organizaciones en el mundo. Lo que debemos decidir juntos es **qué nivel de servicio pagar**, porque eso determina la confiabilidad, las copias de seguridad y el costo.

---

## Las tres opciones

### Opción A: Planes gratuitos. Costo US$0. NO recomendada para el lanzamiento.

Los dos servicios tienen planes gratis. Suena tentador, pero están hechos para proyectos de prueba, no para una herramienta real usada por empresas reales:

- La base de datos gratuita **se pausa sola** después de unos días sin visitas. La primera empresa que entre un lunes podría encontrar la herramienta "apagada".
- **Sin copias de seguridad diarias.** Si algo sale mal, no hay copia de ayer para restaurar.
- Las reglas del plan gratuito de hosting **solo permiten proyectos personales**, no la herramienta de una organización.
- Sin soporte: si algo falla, no hay a quién llamar.

Lo gratuito estuvo bien durante el desarrollo, donde esos límites no importan. El lanzamiento, con datos reales de empresas, merece algo mejor.

### Opción B: Planes profesionales. Aproximadamente US$45 al mes. RECOMENDADA.

Los mismos dos servicios, en su nivel profesional:

- La herramienta está encendida **las 24 horas, todos los días**. Nada se pausa.
- **Copia de seguridad automática de todos los datos, todos los días, conservando los últimos 7 días.** Además, nosotros entregamos a CECODES una copia mensual de los datos, para que ustedes siempre tengan su propia copia.
- Permitido para uso organizacional real, con **soporte de los proveedores**.
- Espacio para crecer: capacidad para muchas más empresas y años de datos de los que van a necesitar por mucho tiempo.

El costo:

- Hosting (el servicio se llama Vercel): **US$20 al mes**
- Base de datos (el servicio se llama Supabase): **US$25 al mes**
- Dirección web: **US$0**, usando el dominio que CECODES ya tiene (explicado abajo)
- **Total: aproximadamente US$45 al mes** (unos $180.000 pesos). Una aclaración honesta: el servicio de hosting cobra por persona con acceso, así que si nuestro acceso técnico necesita su propio puesto, el total sería de unos US$65. Confirmamos la cifra exacta el día 1, **antes de que paguen nada**.
- Al año: aproximadamente **US$540 a US$780** (unos $2,2 a $3,1 millones de pesos), por si necesitan presentarlo contra un presupuesto anual.

### Opción C: Alquilar un servidor propio. Costo real similar o mayor. NO recomendada.

Es posible alquilar un servidor e instalar todo a mano. En el papel puede verse un poco más barato, pero alguien tiene que mantener ese servidor para siempre: actualizaciones de seguridad, reinicios, espacio en disco, renovaciones. Ese trabajo permanente cuesta rápidamente más que la Opción B, y cuando falla de noche no hay soporte del proveedor, solo quien lo mantiene. Las copias de seguridad y el monitoreo no existen a menos que alguien los construya y los vigile.

---

## Nuestra recomendación: Opción B

En una frase: **pagar unos US$45 al mes y la herramienta funciona de manera profesional, con copias diarias, sin niñera.**

1. **Coincide con cómo se construyó la herramienta.** Fue diseñada desde el primer día para estos dos servicios; ponerla en línea ahí es un paso, no un proyecto.
2. **Los datos se tratan en serio.** Copias automáticas diarias más su propia copia mensual, conexiones cifradas, y cada empresa solo puede ver su propia información (lo probamos automáticamente con cada cambio a la herramienta).
3. **Es la opción más barata que de verdad es segura.** La Opción A arriesga que la herramienta esté apagada o que se pierdan datos. La Opción C esconde su costo real en mantenimiento permanente.

### Sobre el mantenimiento (para que los costos estén completos)

Los valores de arriba son lo que cobran los **proveedores**. Nuestro propio trabajo es aparte y funciona así: todo lo necesario para salir en línea (la configuración, el piloto, el acompañamiento de las primeras semanas y cualquier corrección a lo que construimos) hace parte de esta entrega, sin costo extra. Las funciones nuevas o el soporte continuo más allá de eso se acuerdan entre CECODES y nosotros por separado, como siempre.

---

## La dirección web

Recomendamos usar el dominio que CECODES ya tiene, agregando "huella." adelante:

> **huella.cecodes.org.co**

- **Costo: nada extra.** Ustedes ya son dueños de cecodes.org.co; esto es una configuración pequeña, no una compra.
- **Confianza.** Cuando inviten a una empresa afiliada, ella ve una dirección de CECODES, no una desconocida. Para una herramienta que pide datos de las empresas, esto importa.
- Si prefieren una dirección nueva (por ejemplo huelladecarbono.co), también se puede, por unos US$25 a US$30 al año; solo dígannos el nombre.

Quien administra la página web de CECODES puede hacer el cambio, una sola vez, en minutos, con las instrucciones que enviamos.

---

## El plan de lanzamiento, paso a paso

1. **Ustedes responden las dos preguntas pendientes** del documento anterior (urea y Meta), y nosotros las aplicamos. *(Ustedes. Idealmente en la misma respuesta que esta.)*
2. **CECODES aprueba la Opción B y crea las dos cuentas** con una tarjeta de pago. Enviamos instrucciones exactas con pantallazos y los acompañamos por teléfono si hace falta. *(Ustedes, con nuestra guía. 1 día.)*
3. **Nosotros conectamos todo:** la herramienta, la base de datos y la dirección, en su modo final y real. *(Nosotros. 1 a 2 días.)*
4. **Creamos sus cuentas de administrador de CECODES** y cargamos la biblioteca oficial de factores, que ya está preparada. *(Nosotros. El mismo día.)*
5. **Piloto:** una empresa afiliada real ingresa sus datos reales, de principio a fin, y revisamos los resultados juntos. El piloto corre sobre el sistema final y real, así que nada se ingresa dos veces: si el piloto sale bien, sus datos simplemente quedan. Si por alguna razón se abandona, borramos los datos de esa empresa cuando lo pidan. *(Ustedes + una empresa + nosotros. Una semana aproximadamente.)*
6. **Lanzamiento:** ustedes invitan al resto de las empresas. Nosotros quedamos atentos durante las primeras semanas. *(Ustedes + nosotros.)*

**Total, de su "sí" al piloto terminado: unos 10 días** (2 a 3 días de preparación y luego la semana del piloto). Las dos cosas que pueden alargarlo, para que no sorprendan a nadie: qué tan rápido esté disponible la tarjeta de pago, y qué tan rápido quien administra su dominio aplique la configuración pequeña.

### Quién es dueño de qué (importante y simple)

- Las dos cuentas pagas son **de CECODES**, con el pago a nombre de CECODES. La herramienta y los datos son suyos; nada depende de nosotros para existir.
- Nosotros mantenemos **acceso técnico** a esas cuentas para mantener y actualizar la herramienta.
- La dirección web queda bajo el dominio de CECODES, que ustedes ya controlan.
- El **código** de la herramienta está en un repositorio privado; como parte de la entrega, se puede poner una copia bajo una cuenta de CECODES cuando lo pidan.

---

## Las 4 cosas que necesitamos de ustedes para empezar

1. **Las dos respuestas del documento anterior:** urea ("1 fix" o "1 corregir" / "1 keep" o "1 dejar como está") y Meta ("2 company" o "2 empresa" / "2 sede").
2. **Aprobar la Opción B** (unos US$45 al mes) y tener una tarjeta de pago lista para las dos cuentas. Los guiamos paso a paso.
3. **La dirección:** confirmar "huella.cecodes.org.co" (o decirnos el nombre que prefieren), y decirnos quién administra el dominio de CECODES para enviarle la configuración.
4. **La empresa piloto:** elegir una empresa afiliada y la persona que va a ingresar sus datos. Cultivos Casablanca sería una elección natural, porque ya conocemos sus datos.

Un modelo de respuesta que cubre todo de una vez:

> **"1 corregir, 2 empresa. Opción B, adelante, con huella.cecodes.org.co y [nombre de la empresa piloto]."**

---

## Preguntas frecuentes, respondidas antes de que las hagan

**¿Los datos están seguros?**
Sí. Las conexiones van cifradas (el candado en el navegador), la base de datos hace una copia automática todos los días (conservando los últimos 7 días), CECODES recibe además su propia copia mensual, y cada empresa solo puede ver su propia información. Cada número guarda también el historial de quién lo ingresó o lo cambió, como ustedes lo pidieron.

**¿Qué pasa si un mes no pagamos?**
Los proveedores primero avisan y luego suspenden hasta que se reanude el pago; conservan los datos por un periodo antes de borrar nada. Y pase lo que pase, la copia mensual entregada a CECODES es de ustedes: nada depende de nosotros ni de ellos.

**¿El costo nos puede sorprender después?**
Dos notas honestas. Primero, el cobro es en dólares, así que el valor en pesos se mueve con la tasa de cambio, y el banco puede sumar IVA (19%) o una pequeña comisión por pago internacional; presupuesten con algo de margen, porque lo que no cambia es el precio en dólares. Segundo, si el uso creciera tanto que costara más (varios cientos de empresas activas), se vería venir con meses de anticipación, y sería una buena noticia.

**¿Podemos empezar gratis y subir después?**
Técnicamente sí, pero no recomendamos lanzar con empresas reales en planes gratuitos: la base de datos que se pausa sola y la falta de copias de seguridad son riesgos reales con datos reales.

**¿A quién contactan las empresas si tienen problemas usando la herramienta?**
CECODES es la primera puerta (ustedes conocen a sus empresas), y nosotros estamos detrás para todo lo técnico. La herramienta también incluye una guía de uso paso a paso.
