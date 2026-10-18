// Syntax-only build admission; this does not establish a runtime sandbox.
import ts from 'typescript';
import {isBuiltin} from 'node:module';
export function reviewReserveBundleSyntax(bytes){
 if(ts.version!=='5.9.3')throw new Error('Selected syntax parser required');
 if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>4*1024*1024)throw new Error('Bounded bundle bytes required');
 const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 const ast=ts.createSourceFile('reserve-byte-stdio.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 if(ast.parseDiagnostics.length)throw new Error('Bundle syntax refused');
 const imports=new Set();
 function visit(node){
  // Variable/template imports can be absent from a bundler's external-import list.
  if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)throw new Error('Dynamic import syntax refused');
  if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)){
   const name=node.moduleSpecifier;
   if(name){
    if(!ts.isStringLiteral(name)||!isBuiltin(name.text))throw new Error('Static external package refused');
    imports.add(name.text);
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(ast);
 return {parser:'typescript',parserVersion:ts.version,bytes:bytes.length,noImportExpressions:true,staticModuleSpecifiers:[...imports].sort(),scope:'Syntax inspection only; does not exclude aliases, generated code, builtin capabilities or arbitrary loader mechanisms'};
}
