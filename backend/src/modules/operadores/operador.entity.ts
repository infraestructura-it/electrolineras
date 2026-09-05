import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Cargador } from '../cargadores/cargador.entity';

// Representa a un dueño de cargador(es): conjunto residencial, centro comercial, oficina, etc.
@Entity('operadores')
export class Operador {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  email_contacto: string;

  @Column({ nullable: true })
  cuenta_beneficiario: string; // cuenta para dispersión de pagos (Wompi)

  // Comisión pactada con la plataforma, en porcentaje. Configurable por operador,
  // sujeta a negociación comercial (ver docs/electrolineras-especificacion-tecnica.md).
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  comision_pactada: number | null;

  @OneToMany(() => Cargador, (cargador) => cargador.operador)
  cargadores: Cargador[];
}
