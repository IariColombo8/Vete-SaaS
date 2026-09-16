-- Nuevo tipo de entrada de historia clínica: "orden médica" (nota libre —
-- medicamento a comprar en farmacia, aclaraciones, etc. — generada desde
-- Libreta Sanitaria junto con el PDF de la orden).
-- Idempotente.

alter type tipo_visita add value if not exists 'orden_medica';
