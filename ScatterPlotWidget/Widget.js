define([
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dojo/_base/Color",
    "dijit/form/RadioButton",
    "dijit/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dijit/_WidgetsInTemplateMixin",
    "dojo/text!./Widget.html",
    "dojo/on",
    "dojo/domReady!"
], function (declare, lang, Color, RadioButton, _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, template, on) {

    var myColor = {
        colors: {
            background: new Color([0, 0, 0, 0]),
            text: new Color([0, 0, 0, 1]),
            disabled: new Color([205, 205, 205, 1]),
            draw: new Color([0, 245, 245]),
        },
        freqRamp: {
            //colors should not overlap with ramp, otherwise behavior may not be correct
            start: new Color([140, 200, 240, 1]),
            end: new Color([240, 10, 10, 1]),
            breaks: 200,
            cover: function (r, g, b) {
                return this.between(r, this.start.r, this.end.r) && this.between(g, this.start.g, this.end.g) && this.between(b, this.start.b, this.end.b);
            },
            between: function (x, a, b) {
                if (x > Math.max(a, b))
                    return false;
                if (x < Math.min(a, b))
                    return false;
                return true;
            },
            colorAt: function (idx) {
                idx = idx > this.breaks ? this.breaks : idx;
                idx = idx < 0 ? 0 : idx;
                var r = Math.round(this.start.r + (this.end.r - this.start.r) * (idx / this.breaks));
                var g = Math.round(this.start.g + (this.end.g - this.start.g) * (idx / this.breaks));
                var b = Math.round(this.start.b + (this.end.b - this.start.b) * (idx / this.breaks));
                var a = this.start.a + (this.end.a - this.start.a) * (idx / this.breaks);
                return new Color([r, g, b, a]);
            }
        }
    };

    var pixVal2PlotXY = function (pixvalx, pixvaly, w, h) {
        //0 based xy system in plot canvas
        var x = Math.round(pixvalx / 255.0 * (w - 1));
        var y = h - 1 - Math.round(pixvaly / 255.0 * (h - 1));
        return [x, y];
    }

    return declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin], {
        templateString: template,
        //public 
        imageCanvas: null,
        layer: null,
        //private
        _imgCtx: null, _imgData: null,
        _plotCan: null, _plotCtx: null, _plotData: null,
        _marg: 20, //margin of plot canvas
        _bandX: 0, _bandY: 1, //band index of x, y 

        _setLayerAttr: function (newLayer) {
            this.layer = newLayer;
            this._imgCtx = this.layer.getContext();
            this.imageCanvas = this._imgCtx.canvas;
            this._imgData = this._imgCtx.getImageData(0, 0, this.imageCanvas.width, this.imageCanvas.height);
            this._plotCan = this.ScatterPlotWidgetCanvas;
            this._plotCtx = this._plotCan.getContext('2d');
            this.refresh();
        },
        onRadioClick: function (flg) {
            if (flg < 3) {
                this._bandX = flg % 3;
            } else {
                this._bandY = flg % 3;
            }
            this.refresh();
        },
        postCreate: function () {
            var w = this;

            on(this.xrRadio, "click", lang.hitch(this, this.onRadioClick, 0));
            on(this.xgRadio, "click", lang.hitch(this, this.onRadioClick, 1));
            on(this.xbRadio, "click", lang.hitch(this, this.onRadioClick, 2));
            on(this.yrRadio, "click", lang.hitch(this, this.onRadioClick, 3));
            on(this.ygRadio, "click", lang.hitch(this, this.onRadioClick, 4));
            on(this.ybRadio, "click", lang.hitch(this, this.onRadioClick, 5));

            //hand draw related
            var clickX = [], clickY = [];
            var paint = false;
            var redraw = function () {
                var ctx = w._plotCtx;
                ctx.strokeStyle = myColor.colors.draw.toHex();
                ctx.lineJoin = "round";
                ctx.lineWidth = 3;
                for (var i = 0; i < clickX.length; i++) {
                    ctx.beginPath();
                    if (i) {
                        ctx.moveTo(clickX[i - 1], clickY[i - 1]);
                    } else {
                        ctx.moveTo(clickX[i], clickY[i]);
                    }
                    ctx.lineTo(clickX[i], clickY[i]);
                    ctx.closePath();
                    ctx.stroke();
                }
            },
                    closeCurve = function () {
                        var ctx = w._plotCtx;
                        ctx.strokeStyle = myColor.colors.draw.toHex();
                        ctx.lineJoin = "round";
                        ctx.lineWidth = 3;

                        ctx.beginPath();
                        ctx.moveTo(clickX[0], clickY[0]);
                        ctx.lineTo(clickX[clickX.length - 1], clickY[clickY.length - 1]);
                        ctx.closePath();
                        ctx.stroke();
                    },
                    addClick = function (x, y) {
                        if (y > (w._plotCan.height - 20))
                            return;
                        clickX.push(x);
                        clickY.push(y);
                    },
                    selectPix = function (pData) {
                        //technically, it is label pixels not in the freehand draw
                        //based on ray casting algorithm
                        //instead of shooting ray from 1 direction and counting penetrates, shooting ray from 4 direction
                        var ramp = myColor.freqRamp;
                        var drawClr = myColor.colors.draw;

                        var probe = function (ind) {
                            if (ramp.cover(pData.data[ind], pData.data[ind + 1], pData.data[ind + 2])) {
                                pData.data[ind] = myColor.colors.disabled.r;
                                pData.data[ind + 1] = myColor.colors.disabled.g;
                                pData.data[ind + 2] = myColor.colors.disabled.b;
                                pData.data[ind + 3] = Math.round(myColor.colors.disabled.a * 255);
                            } else if (pData.data[ind] === drawClr.r
                                    && pData.data[ind + 1] === drawClr.g
                                    && pData.data[ind + 2] === drawClr.b) {
                                return true;
                            }
                            return false;
                        };

                        for (var i = 0; i < pData.height; i++) {
                            //probe from left
                            for (var j = 0; j < pData.width; j++) {
                                var idx = (i * pData.width + j) * 4;
                                if (probe(idx))
                                    break; //break when reaching first draw pixel
                            }
                            //probe from right
                            for (var j = pData.width - 1; j >= 0; j--) {
                                var idx = (i * pData.width + j) * 4;
                                if (probe(idx))
                                    break;
                            }
                        }
                        //can also probe from up and down to make more accurate selection
                    },
                    filterImage = function () {
                        var idata, pdata, pw, ph, bx, by;
                        with (w) {
                            idata = _imgCtx.getImageData(0, 0, imageCanvas.width, imageCanvas.height);
                            pw = _plotCan.width - 2 * _marg, ph = _plotCan.height - 2 * _marg - 20;//20 in height because of freq legend
                            pdata = _plotCtx.getImageData(_marg, _marg, pw, ph);
                            bx = _bandX, by = _bandY;
                        }

                        var ramp = myColor.freqRamp;
                        var drawClr = myColor.colors.draw;

                        for (var i = 0; i < idata.data.length; i += 4) {
                            var coords = pixVal2PlotXY(idata.data[i + bx], idata.data[i + by], pw, ph);
                            var index = (coords[0] + coords[1] * pw) * 4;
                            if (ramp.cover(pdata.data[index + 0], pdata.data[index + 1], pdata.data[index + 2]) ||
                                    (pdata.data[index + 0] === drawClr.r && pdata.data[index + 1] === drawClr.g && pdata.data[index + 2] === drawClr.b)) {
                                idata.data[i] = drawClr.r;
                                idata.data[i + 1] = drawClr.g;
                                idata.data[i + 2] = drawClr.b;
                                idata.data[i + 3] = Math.round(drawClr.a * 255);
                            }
                        }

                        w._imgCtx.putImageData(idata, 0, 0);
                    };

            with (w) {
                imageCanvas.onmousedown = function (e) {
                    _restore();
                }
                imageCanvas.onmouseup = function (e) {
                    var imgx = e.offsetX, imgy = e.offsetY;
                    var imgIdx = (imgx + imgy * imageCanvas.width) * 4;

                    var valx = _imgData.data[imgIdx + _bandX];
                    var valy = _imgData.data[imgIdx + _bandY];
                    var w = _plotCan.width - 2 * _marg, h = _plotCan.height - 2 * _marg - 20;

                    var xy = pixVal2PlotXY(valx, valy, w, h);
                    var x = xy[0];
                    var y = xy[1];

                    _plotCtx.strokeStyle = myColor.colors.draw.toHex();
                    _plotCtx.lineJoin = "round";
                    _plotCtx.lineWidth = 3;
                    _plotCtx.beginPath();
                    _plotCtx.moveTo(_marg + x - 5, _marg + y - 5);
                    _plotCtx.lineTo(_marg + x + 5, _marg + y - 5);
                    _plotCtx.lineTo(_marg + x + 5, _marg + y + 5);
                    _plotCtx.lineTo(_marg + x - 5, _marg + y + 5);
                    //_plotCtx.lineTo(_marg + x - 1, _marg + y - 1);
                    _plotCtx.stroke();
                    clickX = [_marg + x - 5, _marg + x + 5, _marg + x + 5, _marg + x - 5];//to fool _plotCan.onmouseup to start filtering
                    clickY = [_marg + y - 5, _marg + y - 5, _marg + y + 5, _marg + y + 5];
                    _plotCan.onmouseup();
                }

                _plotCan.onmousedown = function (e) {
                    paint = true;
                    _restore();
                    clickX.push(e.offsetX);
                    clickY.push(e.offsetY);
                    redraw();
                }

                _plotCan.onmouseup = function (e) {
                    paint = false;
                    closeCurve();

                    if (clickX.length < 3) {
                        _restore();//single click will restore
                    } else {
                        var pData = w._plotCtx.getImageData(0, 0, w._plotCan.width, w._plotCan.height - 20);
                        selectPix(pData);
                        _plotCtx.putImageData(pData, 0, 0);
                        filterImage();
                    }

                    clickX = [];
                    clickY = [];
                }

                _plotCan.onmousemove = function (e) {
                    if (paint) {
                        addClick(e.offsetX, e.offsetY);
                        redraw();
                    }
                }
            }
        },
        startup: function () {
            this._drawLegend();
        },
        uninitialize: function () {

        },
        refresh: function () {
            var idata, pdata, w, h, bx, by;
            with (this) {
                _plotCtx.clearRect(0, 0, _plotCan.width, _plotCan.height);
                _plotData = _plotCtx.getImageData(_marg, _marg, _plotCan.width - 2 * _marg, _plotCan.height - 2 * _marg - 20);//20 in height because of freq legend
                idata = _imgData.data, pdata = _plotData.data;
                w = _plotData.width, h = _plotData.height;
                bx = _bandX, by = _bandY;
            }

            for (var i = 0; i < idata.length; i += 4) {
                var coords = pixVal2PlotXY(idata[i + bx], idata[i + by], w, h);
                var index = (coords[0] + coords[1] * w) * 4;
                var freq = pdata[index];
                if (isNaN(freq))
                    continue;
                pdata[index] = freq + 1;

            }

            for (var i = 0; i < pdata.length; i += 4) {
                var freq = pdata[i];
                var c;
                if (isNaN(freq))
                    continue;
                var count = 0;
                if (freq === 0)
                    c = myColor.colors.background;
                else {
                    c = myColor.freqRamp.colorAt(freq);
                    count++;
                }
                ;
                pdata[i] = c.r;
                pdata[i + 1] = c.g;
                pdata[i + 2] = c.b;
                pdata[i + 3] = Math.round(255 * c.a);
            }
            this._restore();
        },
        _restore: function () {
            with (this) {
                //_plotCtx.clearRect(_marg, _marg, _plotCan.width - 2 * _marg, _plotCan.height - 2 * _marg - 20);
                _plotCtx.clearRect(0, 0, _plotCan.width, _plotCan.height);
                if (_imgData) {
                    this._imgCtx.putImageData(_imgData, 0, 0);
                }
                if (_plotData) {
                    _plotCtx.putImageData(_plotData, _marg, _marg);
                }
                _drawAxis();
                _drawLegend();
            }
        },
        _drawLegend: function () {
            with (this) {
                var w = _plotCan.width, h = _plotCan.height;
                _plotCtx.fillText("freq: 1", 20, h - 10);
                _plotCtx.fillText(myColor.freqRamp.breaks + "+", w - 20, h - 10);
                var grd = _plotCtx.createLinearGradient(40, 0, w - 40, 0);
                grd.addColorStop(0, myColor.freqRamp.start.toHex());
                grd.addColorStop(1, myColor.freqRamp.end.toHex());
                var fs = _plotCtx.fillStyle;
                _plotCtx.fillStyle = grd;
                _plotCtx.fillRect(40, h - 20, w - 80, 10);
                _plotCtx.fillStyle = fs;
            }
        },
        _drawAxis: function () {
            var nameOf = function (idx) {
                switch (idx) {
                    case 0:
                        return "Red";
                    case 1:
                        return "Grn";
                    case 2:
                        return "Blu";
                }
            };
            with (this) {
                var w = _plotCan.width, h = _plotCan.height;
                _plotCtx.strokeStyle = myColor.colors.text.toHex();
                _plotCtx.lineJoin = "round";
                _plotCtx.lineWidth = 1;

                _plotCtx.beginPath();
                _plotCtx.moveTo(_marg - 1, _marg);
                _plotCtx.lineTo(_marg - 1, h - _marg - 19);
                _plotCtx.lineTo(w - _marg + 1, h - _marg - 19);
                _plotCtx.stroke();

                _plotCtx.textAlign = "center";
                _plotCtx.fillText("0", _marg / 2, h - 20 - _marg / 2);
                _plotCtx.fillText(nameOf(_bandX), w / 2, h - 20 - _marg / 2);
                _plotCtx.fillText("255", w - _marg, h - 20 - _marg / 2);
                _plotCtx.save();
                //plotCtx.translate(0, 0);
                _plotCtx.rotate(-Math.PI / 2);
                _plotCtx.textAlign = "center";
                _plotCtx.fillText(nameOf(_bandY), -h / 2, _marg / 2);
                _plotCtx.fillText("255", -_marg, _marg / 2);
                _plotCtx.restore();
            }
        }

    });
});