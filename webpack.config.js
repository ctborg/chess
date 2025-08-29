import path from "path";
import HtmlWebpackPlugin from "html-webpack-plugin";

export default {
  entry: "./src/index.jsx",
  output: {
    path: path.resolve("dist"),
    filename: "bundle.[contenthash].js",
    clean: true,
    publicPath: "/"
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/i,
        exclude: /node_modules/,
        use: "babel-loader"
      },
      {
        test: /\.s[ac]ss$/i,
        use: [
          "style-loader",   // Injects styles into the DOM
          "css-loader",     // Resolves @import/url()
          "sass-loader"     // Compiles SCSS to CSS
        ]
      },
      {
        test: /\.(glb|gltf)$/i,
        type: "asset/resource",
        generator: { filename: "assets/models/[name][ext]" }
      },
      {
        test: /\.(png|jpg|jpeg|svg)$/i,
        type: "asset/resource",
        generator: { filename: "assets/textures/[name][ext]" }
      }
    ]
  },
  resolve: {
    extensions: [".js", ".jsx"]
  },
  plugins: [
    new HtmlWebpackPlugin({
      templateContent: `
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width,initial-scale=1" />
            <title>Chess</title>
          </head>
          <body>
            <div id="root"></div>
          </body>
        </html>
      `
    })
  ],
  devServer: {
    historyApiFallback: true,
    hot: true
  }
};
