
(function() {
  var root = this;

  var layerTypes = {
    'template': function(data, fn) { fn(data); }
  };
  
  function map(opts) {
    var m = new Map(opts);
    document.write(m._renderer.el.outerHTML);
    m._renderer.el = document.getElementById(m._renderer.id);
    return m;
  }

  function register(type, fn) {
    layerTypes[type] = fn;
  }


  /**
   * mercator projecttion
   */
  function MercatorProjection() {
    this.TILE_SIZE = 256;
    this.pixelOrigin_ = { x: this.TILE_SIZE / 2, y: this.TILE_SIZE / 2 };
    this.pixelsPerLonDegree_ = this.TILE_SIZE / 360;
    this.pixelsPerLonRadian_ = this.TILE_SIZE / (2 * Math.PI);
  }
    
  MercatorProjection.prototype.toPixelCoordinate = function(worldCoordinate, zoom) {
    var numTiles = 1 << zoom;
    return {
      x: worldCoordinate.x * numTiles, 
      y: worldCoordinate.y * numTiles
    }
  }

  MercatorProjection.prototype.fromLatLngToPoint = function(latLng,
      opt_point) {
    var me = this;
    var point = opt_point || { x:0, y: 0 };
    var origin = me.pixelOrigin_;

    point.x = origin.x + latLng[1] * me.pixelsPerLonDegree_;

    // NOTE(appleton): Truncating to 0.9999 effectively limits latitude to
    // 89.189.  This is about a third of a tile past the edge of the world
    // tile.
    var siny = bound(Math.sin(degreesToRadians(latLng[0])), -0.9999,
        0.9999);
    point.y = origin.y + 0.5 * Math.log((1 + siny) / (1 - siny)) *
        -me.pixelsPerLonRadian_;
    return point;
  };

   function bound(value, opt_min, opt_max) {
    if (opt_min != null) value = Math.max(value, opt_min);
    if (opt_max != null) value = Math.min(value, opt_max);
    return value;
  }

  function degreesToRadians(deg) {
    return deg * (Math.PI / 180);
  }
  

  MercatorProjection.prototype.pixelToTile = function(pixelCoordinate) {
    return {
      x: Math.floor(pixelCoordinate.x / this.TILE_SIZE),
      y: Math.floor(pixelCoordinate.y / this.TILE_SIZE)
    };
  };

  MercatorProjection.prototype.fromLatLngToPixel = function(latLng, zoom) {
    var p = this.fromLatLngToPoint(latLng);
    return this.toPixelCoordinate(p, zoom);
  };

  function Map(opts) {
    opts = opts || {};
    opts.renderer_type = opts.renderer_type || 'dom';
    this.options = opts;
    this.projection = new MercatorProjection() || opts.projection;
    this._renderer = new renderers[opts.renderer_type](this.options.width, this.options.height);
    this._renderer.map = this;
  }
  
  Map.prototype.fetchLayers = function(done) {
    this.layers = [];
    var count = 0;
    var self = this;
    for(var lyr = 0; lyr < this.options.layers.length; ++lyr) {
      var layer = this.options.layers[lyr];
      var type = layer.type;
      if(typeof(layer) === 'string') {
        type = 'template';
      }
      layerTypes[type](
        layer, 
        (function(i) {
          return function(tmpl) { 
            self.layers[i] = tmpl; 
            ++count;
            if(count == self.options.layers.length) {
              done.call(self);
            }
          };
        })(lyr)
      );
    }
  };

  Map.prototype.visibleTiles = function() {
    width = this.options.width;
    height = this.options.height;
    var widthHalf = width / 2;
    var heightHalf = height / 2;
    var center_point = this.projection.fromLatLngToPixel(this.options.center, this.options.zoom);
    center_point.x -= widthHalf;
    center_point.y -= heightHalf;
    var tile = this.projection.pixelToTile(center_point, this.zoom);
    var offset_x = center_point.x%this.projection.TILE_SIZE;
    var offset_y = center_point.y%this.projection.TILE_SIZE;

    var num_tiles_x = Math.ceil((width + offset_x)/this.projection.TILE_SIZE);
    var num_tiles_y = Math.ceil((height + offset_y)/this.projection.TILE_SIZE);

    var tiles = [];
    for(var i = 0; i < num_tiles_x; ++i) {
        for(var j = 0; j < num_tiles_y; ++j) {
            var tile_x = tile.x + i;
            var tile_y = tile.y + j;
            tiles.push({
                x: tile_x * this.projection.TILE_SIZE,
                y: tile_y * this.projection.TILE_SIZE,
                zoom: this.options.zoom,
                i: tile_x,
                j: tile_y
            });
        }
    }
    var self = this;
    // by distance to center
    tiles.sort(function(a, b) {
      var ox =  (widthHalf/self.projection.TILE_SIZE)|0;
      var oy =  (heightHalf/self.projection.TILE_SIZE)|0;
      var da = Math.abs(a.i - tile.x - ox ) + Math.abs(a.j - tile.y -oy);
      var db = Math.abs(b.i - tile.x - ox) + Math.abs(b.j - tile.y -oy);
      return da - db;
    });
    return tiles;

  };

  function DomRenderer(w, h) {
    var el = this.el = document.createElement('div');
    var id = "pxmap_" + new Date().getTime();
    this.id = id;
    el.setAttribute('id', id);
    el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.style.width = w + "px";
    el.style.height = h + "px";
  }

  DomRenderer.prototype.renderTile = function(img_url, x, y, TILE_SIZE) {
    var el = this.el;
    var img = new Image();
    img.crossOrigin = "";
    img.src = img_url;
    img.style.position = 'absolute';
    img.style.left = x + "px";
    img.style.top = y + "px";
    img.style.width = TILE_SIZE  + "px";
    img.style.height = TILE_SIZE + "px";
    el.appendChild(img);
  };

  function perpixel(imagedata, w, h, options, fn) {
     var pixels = imagedata.data;
     for(var i = 0; i < w; ++i) {
      for(var j = 0; j < h; ++j) {
       var idx = 4*(j*w + i);
       var r = pixels[idx + 0];
       var g = pixels[idx + 1];
       var b = pixels[idx + 2];
       var a = pixels[idx + 3];
       var rgba = fn([r, g, b, a], i, j)
       r = rgba[0]
       g = rgba[1]
       b = rgba[2]
       a = rgba[3]
       //r *= 0.1;
       //r = g = b = 40;
       //a = 255;
       //a *= 0.3
       pixels[idx + 0] = r;
       pixels[idx + 1] = g;
       pixels[idx + 2] = b;
       pixels[idx + 3] = a;
      }
     }
  }

  function noise(pixels, w, h, qty) {
    perpixel(pixels, w, h, null, function(rgba) {
      var rand = (2*Math.random() - 1)*qty;
      rgba[0] += rand;
      rgba[1] += rand;
      rgba[2] += rand;
      return rgba;
    });
  }

  // from https://github.com/meltingice/CamanJS-Plugins/blob/f958b78efcf78fd888b7a60b9e07812a2b45eab2/src/posterize.coffee
  function posterize(pixels, w, h, adjust) {
    var numOfAreas = 256 / adjust;
    var numOfValues = 255 / (adjust - 1);
    perpixel(pixels, w, h, null, function(rgba) {
      rgba[0] = Math.floor(Math.floor(rgba[0] / numOfAreas) * numOfValues);
      rgba[1] = Math.floor(Math.floor(rgba[1] / numOfAreas) * numOfValues);
      rgba[2] = Math.floor(Math.floor(rgba[2] / numOfAreas) * numOfValues);
      return rgba;
    });
  };

  function blur(pixels, w, h, options, map) {
    options.passes = options.passes || 10;
    var el = document.createElement('canvas');
    el.width = w;
    el.height = h;
    var ctx = el.getContext('2d');
    ctx.putImageData(pixels, 0, 0);

    for(var i = 0; i < options.passes ; ++i) {
      var small = document.createElement('canvas');
      small.width = w >> 1;
      small.height = h >> 1;
      small.getContext('2d').drawImage(el, 0, 0, small.width, small.height);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(small, 0, 0, el.width, el.height);
    }

    if(options.center) {
      var center = map.projection.fromLatLngToPixel(options.center, map.options.zoom);
      var map_center = map.projection.fromLatLngToPixel(map.options.center, map.options.zoom);
      center.x -= map_center.x - w/2;
      center.y -= map_center.y - h/2;
    }

    // get and blend
    var blurred = ctx.getImageData(0, 0, w, h).data;
    perpixel(pixels, w, h, null, function(rgba, i, j) {
      var factor = 1.0;
      if (options.center) {
        var dx = center.x - i;
        var dy = center.y - j;
        factor = Math.sqrt(dx*dx + dy*dy)/options.dist;
        if(factor > 1) factor = 1.0;
        //factor = 1;
      }
      var idx = 4*(j*w + i);
      return [
        blurred[idx + 0] * factor + (1 - factor)*rgba[0],
        blurred[idx + 1] * factor + (1 - factor)*rgba[1],
        blurred[idx + 2] * factor + (1 - factor)*rgba[2],
        blurred[idx + 3] * factor + (1 - factor)*rgba[3]
      ];
    });
  }

  function CanvasRenderer(w, h) {
    this.tiles = [];
    this.loaded = 0;
    this.processorTypes = {
      'noise': noise,
      'blur': blur,
      'posterize': posterize
    };
    this.processor = [];
    this.w = w;
    this.h = h;
    var el = this.el = document.createElement('canvas');
    var id = "pxmap_" + new Date().getTime();
    this.id = id;
    el.setAttribute('id', id);
    el.width = w;
    el.height = h;
  }

  CanvasRenderer.prototype.register = function(type, fn) {
    this.processorTypes[type] = fn;
  };

  CanvasRenderer.prototype.addPass = function(type, opts){
    this.processor.push({
      type: type,
      options: opts
    });
    return this;
  };

  CanvasRenderer.prototype.render = function() {
    var ctx = this.el.getContext('2d');
    for(var i = 0; i < this.tiles.length; ++i) {
      var t = this.tiles[i];
      ctx.drawImage(t.img, t.x, t.y);
    }
    var idata = ctx.getImageData(0, 0, this.w, this.h);
    for(var i = 0; i < this.processor.length; ++i) {
      var p = this.processor[i];
      this.processorTypes[p.type](idata, this.w, this.h, p.options, this.map);
    };
    ctx.putImageData(idata, 0, 0);
  };


  CanvasRenderer.prototype.renderTile = function(img_url, x, y, TILE_SIZE) {
    var self = this;
    var el = this.el;
    var img = new Image();
    img.crossOrigin = "";
    img.onload = function() {
      ++self.loaded;
      if(self.tiles.length == self.loaded) {
        self.render();
      }
    }
    this.tiles.push({ img: img, x: x, y: y });
    img.src = img_url;
  };

  var renderers = {
    'dom': DomRenderer,
    'canvas': CanvasRenderer
  }

  Map.prototype.renderer = function() {
    return this._renderer;
  }

  Map.prototype.render = function() {
    var tiles = this.visibleTiles();
    var center_point = this.projection.fromLatLngToPixel(this.options.center, this.options.zoom);
    center_point.x -= this.options.width/2;
    center_point.y -= this.options.height/2;
    this.fetchLayers(function() {
      for(var lyr = 0; lyr < this.layers.length; ++lyr) {
        var layer = this.layers[lyr];
        var template = layer;
        var subdomains = 'abcd';
        for(var i = 0; i < tiles.length; ++i) {
          var tile = tiles[i];
          var img = template
              .replace('{s}', 'abcd'[(tile.i + tile.j) % 4])
              .replace('{x}', tile.i)
              .replace('{y}', tile.j)
              .replace('{z}', tile.zoom);
          this._renderer.renderTile(img, 
            tile.x - center_point.x,
            tile.y - center_point.y,
            this.projection.TILE_SIZE
          );
        }
      }
    });
    return this;
  };

  root.mapshot = {
    map: map,
    register: register,
    Map: Map
  };

}());
