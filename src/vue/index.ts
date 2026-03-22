import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  type PropType,
} from "vue";
import { CharacterPlayer } from "../core/CharacterPlayer.js";
import type {
  CharacterManifest,
  CharacterPlayerOptions,
  CharacterPose,
} from "../types.js";

export const CharacterView = defineComponent({
  name: "CharacterView",
  props: {
    manifest: { type: Object as PropType<CharacterManifest>, required: true },
    baseUrl: { type: String, required: true },
    initialState: String as PropType<string | undefined>,
    initialPose: Object as PropType<CharacterPose | undefined>,
    debug: Boolean as PropType<boolean | undefined>,
    transitionMs: Number as PropType<number | undefined>,
    fitPadding: Number as PropType<number | undefined>,
    queueStateUntilCycleEnd: Boolean as PropType<boolean | undefined>,
  },
  setup(props) {
    const el = ref<HTMLElement | null>(null);
    let player: CharacterPlayer | null = null;

    onMounted(async () => {
      if (!el.value) {
        return;
      }
      const options: CharacterPlayerOptions = {
        container: el.value,
        manifest: props.manifest,
        baseUrl: props.baseUrl,
      };
      if (props.initialState !== undefined) {
        options.initialState = props.initialState;
      }
      if (props.initialPose !== undefined) {
        options.initialPose = props.initialPose;
      }
      if (props.debug !== undefined) {
        options.debug = props.debug;
      }
      if (props.transitionMs !== undefined) {
        options.transitionMs = props.transitionMs;
      }
      if (props.fitPadding !== undefined) {
        options.fitPadding = props.fitPadding;
      }
      if (props.queueStateUntilCycleEnd !== undefined) {
        options.queueStateUntilCycleEnd = props.queueStateUntilCycleEnd;
      }
      player = new CharacterPlayer(options);
      await player.init();
    });

    onBeforeUnmount(() => {
      player?.destroy();
      player = null;
    });

    return () =>
      h("div", {
        ref: el,
        style: {
          width: "100%",
          height: "100%",
          minHeight: "240px",
        },
      });
  },
});

export default CharacterView;
