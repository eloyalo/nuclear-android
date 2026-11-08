import { MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';

const MOUSE_ACTIVATION_DISTANCE_PX = 5;
const TOUCH_ACTIVATION_DELAY_MS = 250;
const TOUCH_ACTIVATION_TOLERANCE_PX = 8;

export const useReorderSensors = () =>
  useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: MOUSE_ACTIVATION_DISTANCE_PX },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: TOUCH_ACTIVATION_DELAY_MS,
        tolerance: TOUCH_ACTIVATION_TOLERANCE_PX,
      },
    }),
  );
