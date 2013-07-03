
this is a small library that allows you to put static maps on your page:

```
<script>
  mapshot.map({
    center: [40, -4],
    zoom: 4,
    width: 700,
    height: 300,
    renderer_type: 'canvas',
    layers: [
      'http://tile.stamen.com/toner/{z}/{x}/{y}.png', // stamen.com
    ]
  }).render()
</script>

```
