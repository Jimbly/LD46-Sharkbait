#pragma WebGL2

precision lowp float;

uniform sampler2D tex0;

varying lowp vec4 interp_color;
varying vec2 interp_texcoord;

uniform vec4 vis_param;

void main(void) {
  vec4 tex = texture2D(tex0, interp_texcoord);
  if (tex.r > vis_param.x) {
    discard;
  }
  gl_FragColor = interp_color;
}
